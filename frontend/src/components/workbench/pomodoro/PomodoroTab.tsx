import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, type PomodoroSettings, type PomodoroState } from '../../../api/client'
import {
  acquireWakeLock,
  formatClock,
  playPomodoroChime,
  requestNotificationPermissionQuietly,
  sendPomodoroNotification,
  vibrateSoft,
} from './pomodoroAudio'
import { PomodoroDeskOverlay, type PomodoroPhase } from './PomodoroDeskOverlay'
import { PomodoroHarvestPanel } from './PomodoroHarvestPanel'
import { PomodoroSettingsModal } from './PomodoroSettingsModal'
import { PomodoroTimerCard } from './PomodoroTimerCard'

interface PersistedTimer {
  phase: PomodoroPhase
  running: boolean
  targetEndAt: number | null
  pausedRemainingSec: number
  startedAt: number | null
  cycleId: string
  tag: string
  note: string
}

function durationForPhase(phase: PomodoroPhase, s: PomodoroSettings): number {
  if (phase === 'short_break') return s.short_break_minutes * 60
  if (phase === 'long_break') return s.long_break_minutes * 60
  return s.focus_minutes * 60
}

function makeCycleId(): string {
  return `cyc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function PomodoroTab({ userId, onToast }: { userId: string; onToast: (msg: string) => void }) {
  const storageKey = `portal_pomodoro_v1_${userId}`
  const [state, setState] = useState<PomodoroState | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deskOpen, setDeskOpen] = useState(false)
  const [wakeLockActive, setWakeLockActive] = useState(false)
  const [justHarvested, setJustHarvested] = useState(false)

  const [timer, setTimer] = useState<PersistedTimer>({
    phase: 'focus',
    running: false,
    targetEndAt: null,
    pausedRemainingSec: 25 * 60,
    startedAt: null,
    cycleId: makeCycleId(),
    tag: '学习',
    note: '',
  })
  const [nowMs, setNowMs] = useState(() => Date.now())
  const completingCycleRef = useRef<string | null>(null)
  const wakeSentinelRef = useRef<{ release: () => Promise<void> } | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .getPomodoro()
      .then((res) => {
        if (!alive) return
        setState(res)
        let restored: PersistedTimer | null = null
        try {
          const raw = localStorage.getItem(storageKey)
          if (raw) restored = JSON.parse(raw) as PersistedTimer
        } catch {
          restored = null
        }
        if (restored && restored.phase) {
          setTimer(restored)
        } else {
          setTimer((prev) => ({
            ...prev,
            pausedRemainingSec: durationForPhase('focus', res.settings),
            tag: res.tags[0] || '学习',
          }))
        }
      })
      .catch((e) => onToast(e instanceof Error ? e.message : '加载番茄专注失败'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [storageKey, onToast])

  useEffect(() => {
    if (loading) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(timer))
    } catch {
      // ignore storage quota errors
    }
  }, [loading, storageKey, timer])

  const settings = state?.settings
  const totalSec = settings ? durationForPhase(timer.phase, settings) : 25 * 60
  const remainingSec = timer.running && timer.targetEndAt
    ? Math.max(0, (timer.targetEndAt - nowMs) / 1000)
    : timer.pausedRemainingSec

  const handleCycleComplete = useCallback(
    async (snap: PersistedTimer) => {
      if (!settings || completingCycleRef.current === snap.cycleId) return
      completingCycleRef.current = snap.cycleId

      if (settings.sound_enabled) {
        playPomodoroChime(snap.phase === 'focus' ? 'focus_done' : 'break_done')
      }
      vibrateSoft()

      if (snap.phase === 'focus') {
        setSubmitting(true)
        try {
          const res = await api.recordPomodoroSession({
            client_id: snap.cycleId,
            duration_minutes: settings.focus_minutes,
            started_at: snap.startedAt ?? undefined,
            completed_at: snap.targetEndAt ?? Date.now(),
            tag: snap.tag || '学习',
            note: snap.note.trim(),
          })
          setState(res.state)
          const count = res.state.summary.today_tomatoes
          setJustHarvested(true)
          window.setTimeout(() => setJustHarvested(false), 1800)
          const msg = `收获 1 颗番茄！今天已攒下 ${count} 颗`
          onToast(msg)
          sendPomodoroNotification('番茄收获完成', `${msg}，休息片刻吧`)
          const nextPhase: PomodoroPhase =
            count > 0 && count % settings.long_break_interval === 0 ? 'long_break' : 'short_break'
          setTimer((prev) => ({
            ...prev,
            phase: nextPhase,
            running: false,
            targetEndAt: null,
            startedAt: null,
            pausedRemainingSec: durationForPhase(nextPhase, settings),
            cycleId: makeCycleId(),
          }))
        } catch (e) {
          onToast(e instanceof Error ? e.message : '保存番茄记录失败，请重试')
          setTimer((prev) => ({ ...prev, running: false, targetEndAt: null, pausedRemainingSec: 0 }))
        } finally {
          setSubmitting(false)
        }
      } else {
        onToast('休息结束，随时可以开启下一颗番茄')
        sendPomodoroNotification('休息时间到', '准备开始新一轮专注吧')
        setTimer((prev) => ({
          ...prev,
          phase: 'focus',
          running: false,
          targetEndAt: null,
          startedAt: null,
          pausedRemainingSec: durationForPhase('focus', settings),
          cycleId: makeCycleId(),
        }))
      }
    },
    [settings, onToast],
  )

  // Tick smoothly & snap accurately when returning from background/lockscreen.
  useEffect(() => {
    if (!timer.running || !timer.targetEndAt) return
    const tick = () => {
      const t = Date.now()
      setNowMs(t)
      if (t >= (timer.targetEndAt ?? 0)) {
        void handleCycleComplete(timer)
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [timer, handleCycleComplete])

  // Browser tab live countdown title while active.
  useEffect(() => {
    if (!timer.running) return
    const prevTitle = document.title
    const label = timer.phase === 'focus' ? '专注中' : '休息中'
    document.title = `${formatClock(remainingSec)} · ${label}`
    return () => {
      document.title = prevTitle
    }
  }, [timer.running, timer.phase, remainingSec])

  // Screen Wake Lock while running or inside fullscreen desk mode.
  const wantWakeLock = Boolean(settings?.wake_lock_enabled && (timer.running || deskOpen))
  useEffect(() => {
    let active = true
    const release = () => {
      const s = wakeSentinelRef.current
      wakeSentinelRef.current = null
      setWakeLockActive(false)
      if (s) void s.release().catch(() => {})
    }
    if (!wantWakeLock) {
      release()
      return
    }
    const grab = async () => {
      const s = await acquireWakeLock()
      if (!active) {
        if (s) void s.release().catch(() => {})
        return
      }
      wakeSentinelRef.current = s
      setWakeLockActive(Boolean(s))
    }
    void grab()
    const onVis = () => {
      if (document.visibilityState === 'visible') void grab()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVis)
      release()
    }
  }, [wantWakeLock])

  function handleToggleRun() {
    if (!settings) return
    requestNotificationPermissionQuietly()
    const now = Date.now()
    if (timer.running && timer.targetEndAt) {
      const left = Math.max(1, Math.ceil((timer.targetEndAt - now) / 1000))
      setTimer((prev) => ({ ...prev, running: false, targetEndAt: null, pausedRemainingSec: left }))
      return
    }
    const baseSec = timer.pausedRemainingSec > 0 ? timer.pausedRemainingSec : durationForPhase(timer.phase, settings)
    setNowMs(now)
    setTimer((prev) => ({
      ...prev,
      running: true,
      startedAt: prev.startedAt ?? now,
      targetEndAt: now + baseSec * 1000,
    }))
  }

  function handleSelectPhase(next: PomodoroPhase) {
    if (!settings) return
    setTimer((prev) => ({
      ...prev,
      phase: next,
      running: false,
      targetEndAt: null,
      startedAt: null,
      pausedRemainingSec: durationForPhase(next, settings),
      cycleId: makeCycleId(),
    }))
  }

  async function handleSaveSettings(patch: Partial<PomodoroSettings>) {
    setSavingSettings(true)
    try {
      const res = await api.updatePomodoroSettings(patch)
      setState(res.state)
      if (!timer.running) {
        setTimer((prev) => ({
          ...prev,
          pausedRemainingSec: durationForPhase(prev.phase, res.state.settings),
        }))
      }
      onToast('专注节奏已更新')
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存设置失败')
    } finally {
      setSavingSettings(false)
    }
  }

  async function handleDeleteSession(sessionId: string) {
    setDeletingId(sessionId)
    try {
      const res = await api.deletePomodoroSession(sessionId)
      setState(res.state)
      onToast('已删除该条番茄记录')
    } catch (e) {
      onToast(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading || !state || !settings) {
    return (
      <div className="py-20 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin" />
        正在加载番茄专注…
      </div>
    )
  }

  return (
    <div data-testid="pomodoro-tab" className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-12 items-start">
        <div className="lg:col-span-6">
          <PomodoroTimerCard
            phase={timer.phase}
            remainingSec={remainingSec}
            totalSec={totalSec}
            running={timer.running}
            settings={settings}
            tags={state.tags}
            tag={timer.tag}
            note={timer.note}
            wakeLockActive={wakeLockActive}
            submitting={submitting}
            onSelectPhase={handleSelectPhase}
            onSelectPreset={(focus, shortBreak, longBreak) =>
              void handleSaveSettings({
                focus_minutes: focus,
                short_break_minutes: shortBreak,
                long_break_minutes: longBreak,
              })
            }
            onChangeTag={(tag) => setTimer((prev) => ({ ...prev, tag }))}
            onChangeNote={(note) => setTimer((prev) => ({ ...prev, note }))}
            onToggleRun={handleToggleRun}
            onReset={() => handleSelectPhase(timer.phase)}
            onSkip={() => handleSelectPhase(timer.phase === 'focus' ? 'short_break' : 'focus')}
            onOpenDesk={() => setDeskOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
        <div className="lg:col-span-6">
          <PomodoroHarvestPanel
            state={state}
            deletingId={deletingId}
            justHarvested={justHarvested}
            onDeleteSession={(sid) => void handleDeleteSession(sid)}
          />
        </div>
      </div>

      {deskOpen && (
        <PomodoroDeskOverlay
          phase={timer.phase}
          remainingSec={remainingSec}
          totalSec={totalSec}
          running={timer.running}
          tag={timer.tag}
          todayTomatoes={state.summary.today_tomatoes}
          dailyGoal={state.summary.daily_goal}
          wakeLockActive={wakeLockActive}
          onToggleRun={handleToggleRun}
          onReset={() => handleSelectPhase(timer.phase)}
          onClose={() => setDeskOpen(false)}
        />
      )}

      {settingsOpen && (
        <PomodoroSettingsModal
          settings={settings}
          saving={savingSettings}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
