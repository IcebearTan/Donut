import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Minimize2, Pause, Play, RotateCcw, SunMedium } from 'lucide-react'
import { formatClock } from './pomodoroAudio'
import { TomatoIcon } from './TomatoGraphic'

export type PomodoroPhase = 'focus' | 'short_break' | 'long_break'

const PHASE_META: Record<PomodoroPhase, { label: string; color: string }> = {
  focus: { label: '专注进行中', color: '#E5534B' },
  short_break: { label: '短休息片刻', color: '#3DA35D' },
  long_break: { label: '深度长休息', color: '#4B8CE5' },
}

interface Props {
  phase: PomodoroPhase
  remainingSec: number
  totalSec: number
  running: boolean
  tag: string
  todayTomatoes: number
  dailyGoal: number
  wakeLockActive: boolean
  onToggleRun: () => void
  onReset: () => void
  onClose: () => void
}

export function PomodoroDeskOverlay({
  phase,
  remainingSec,
  totalSec,
  running,
  tag,
  todayTomatoes,
  dailyGoal,
  wakeLockActive,
  onToggleRun,
  onReset,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ') {
        e.preventDefault()
        onToggleRun()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onToggleRun])

  const progress = totalSec > 0 ? Math.min(1, Math.max(0, 1 - remainingSec / totalSec)) : 0
  const meta = PHASE_META[phase]
  const visibleSlots = Math.min(12, Math.max(dailyGoal, todayTomatoes))

  return createPortal(
    <div
      data-testid="pomodoro-desk-overlay"
      className="fixed inset-0 z-50 flex flex-col justify-between p-6 sm:p-10 select-none animate-msg-in"
      style={{
        background: 'radial-gradient(circle at 50% 35%, #1d1f26 0%, #101216 70%, #0b0c10 100%)',
        color: '#f5f6f8',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: running ? meta.color : 'rgba(255,255,255,0.35)' }}
          />
          <span className="text-xs sm:text-sm font-medium tracking-wide text-white/80">
            {meta.label}
            {phase === 'focus' && tag ? ` · ${tag}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {wakeLockActive && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap shrink-0 bg-white/10 text-white/75">
              <SunMedium size={12} />
              屏幕常亮中
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 bg-white/10 hover:bg-white/15 text-white/85 transition-colors cursor-pointer"
          >
            <Minimize2 size={13} />
            退出书桌模式
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 my-4">
        <div
          className="text-[76px] sm:text-[132px] font-semibold tracking-tight leading-none tabular-nums"
          style={{ letterSpacing: '-0.03em' }}
        >
          {formatClock(remainingSec)}
        </div>

        <div className="w-full max-w-md h-1.5 rounded-full overflow-hidden bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.round(progress * 100)}%`, background: meta.color }}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onToggleRun}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-semibold transition-transform pressable cursor-pointer"
            style={{ background: meta.color, color: '#ffffff' }}
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
            {running ? '暂停' : '继续专注'}
          </button>
          <button
            type="button"
            onClick={onReset}
            title="重置本轮计时"
            className="w-11 h-11 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/15 text-white/80 transition-colors cursor-pointer"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: visibleSlots }, (_, idx) => (
            <TomatoIcon
              key={idx}
              size={18}
              variant={idx < todayTomatoes ? 'ripe' : 'empty'}
            />
          ))}
          {todayTomatoes > visibleSlots && (
            <span className="text-xs text-white/70 tabular-nums ml-1">+{todayTomatoes - visibleSlots}</span>
          )}
        </div>
        <span className="text-xs text-white/60 tabular-nums whitespace-nowrap">
          今日已收获 {todayTomatoes} / {dailyGoal} 颗番茄
        </span>
      </div>
    </div>,
    document.body,
  )
}
