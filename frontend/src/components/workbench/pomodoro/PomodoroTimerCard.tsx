import { Maximize2, Pause, Play, RotateCcw, SkipForward, SlidersHorizontal, SunMedium } from 'lucide-react'
import type { PomodoroSettings } from '../../../api/client'
import { formatClock } from './pomodoroAudio'
import type { PomodoroPhase } from './PomodoroDeskOverlay'
import { POMODORO_PRESETS, TomatoIcon } from './TomatoGraphic'

const PHASE_OPTIONS: Array<{ id: PomodoroPhase; label: string; color: string }> = [
  { id: 'focus', label: '专注', color: '#E5534B' },
  { id: 'short_break', label: '短休', color: '#3DA35D' },
  { id: 'long_break', label: '长休', color: '#4B8CE5' },
]

interface Props {
  phase: PomodoroPhase
  remainingSec: number
  totalSec: number
  running: boolean
  settings: PomodoroSettings
  tags: string[]
  tag: string
  note: string
  wakeLockActive: boolean
  submitting: boolean
  onSelectPhase: (p: PomodoroPhase) => void
  onSelectPreset: (focus: number, shortBreak: number, longBreak: number) => void
  onChangeTag: (next: string) => void
  onChangeNote: (next: string) => void
  onToggleRun: () => void
  onReset: () => void
  onSkip: () => void
  onOpenDesk: () => void
  onOpenSettings: () => void
}

export function PomodoroTimerCard({
  phase,
  remainingSec,
  totalSec,
  running,
  settings,
  tags,
  tag,
  note,
  wakeLockActive,
  submitting,
  onSelectPhase,
  onSelectPreset,
  onChangeTag,
  onChangeNote,
  onToggleRun,
  onReset,
  onSkip,
  onOpenDesk,
  onOpenSettings,
}: Props) {
  const activeMeta = PHASE_OPTIONS.find((p) => p.id === phase) || PHASE_OPTIONS[0]
  const progress = totalSec > 0 ? Math.min(1, Math.max(0, 1 - remainingSec / totalSec)) : 0
  const radius = 98
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - progress)

  return (
    <section
      className="rounded-2xl p-5 sm:p-6 flex flex-col gap-5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex items-center p-1 rounded-xl gap-1"
          style={{ background: 'var(--bg-elevated)' }}
        >
          {PHASE_OPTIONS.map((opt) => {
            const active = opt.id === phase
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectPhase(opt.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer"
                style={{
                  background: active ? 'var(--bg-surface)' : 'transparent',
                  color: active ? opt.color : 'var(--text-secondary)',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : undefined,
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="pomodoro-desk-btn"
            onClick={onOpenDesk}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors pressable cursor-pointer hover:bg-(--bg-hover)"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          >
            <Maximize2 size={13} />
            书桌时钟
          </button>
          <button
            type="button"
            data-testid="pomodoro-settings-btn"
            onClick={onOpenSettings}
            title="节奏与提醒设置"
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer hover:bg-(--bg-hover)"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-2">
        <div className="relative w-[228px] h-[228px] flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 220 220" aria-hidden="true">
            <circle
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke="var(--bg-elevated)"
              strokeWidth="8"
            />
            <circle
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke={activeMeta.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 300ms linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1.5 text-xs font-medium mb-1" style={{ color: activeMeta.color }}>
              {phase === 'focus' && <TomatoIcon size={15} variant="ripe" />}
              <span>{phase === 'focus' ? (running ? '专注中' : '准备专注') : activeMeta.label}</span>
            </div>
            <div
              data-testid="pomodoro-clock"
              className="text-5xl font-semibold tracking-tight tabular-nums leading-none"
            >
              {formatClock(remainingSec)}
            </div>
            {wakeLockActive && (
              <span
                className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px]"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
              >
                <SunMedium size={11} />
                屏幕常亮
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 mt-4">
          <button
            type="button"
            onClick={onReset}
            title="重置本轮"
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer hover:bg-(--bg-hover)"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            data-testid="pomodoro-toggle-btn"
            disabled={submitting}
            onClick={onToggleRun}
            className="inline-flex items-center justify-center gap-2 min-w-[136px] px-6 py-3 rounded-full text-sm font-semibold transition-opacity pressable cursor-pointer hover:opacity-92 disabled:opacity-60"
            style={{ background: activeMeta.color, color: '#ffffff' }}
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
            {running ? '暂停' : remainingSec < totalSec ? '继续' : phase === 'focus' ? '开始专注' : '开始休息'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            title={phase === 'focus' ? '切到休息' : '切回专注'}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors cursor-pointer hover:bg-(--bg-hover)"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            <SkipForward size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {POMODORO_PRESETS.map((p) => {
          const active = settings.focus_minutes === p.focus && settings.short_break_minutes === p.shortBreak
          return (
            <button
              key={p.id}
              type="button"
              disabled={running}
              onClick={() => onSelectPreset(p.focus, p.shortBreak, p.longBreak)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50"
              style={{
                background: active ? 'rgba(229, 83, 75, 0.14)' : 'var(--bg-elevated)',
                color: active ? '#E5534B' : 'var(--text-secondary)',
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div className="space-y-2.5 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.slice(0, 7).map((t) => {
            const active = t === tag
            return (
              <button
                key={t}
                type="button"
                onClick={() => onChangeTag(t)}
                className="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
                style={{
                  background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                }}
              >
                {t}
              </button>
            )
          })}
        </div>
        <input
          type="text"
          maxLength={120}
          value={note}
          onChange={(e) => onChangeNote(e.target.value)}
          placeholder="记录这一轮打算学什么（可选，如：背完 Unit 3 单词）"
          className="w-full px-3.5 py-2 rounded-xl text-xs outline-none"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
      </div>
    </section>
  )
}
