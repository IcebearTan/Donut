import { useState } from 'react'
import { Loader2, SlidersHorizontal, Volume2, X, Zap } from 'lucide-react'
import type { PomodoroSettings } from '../../../api/client'
import { POMODORO_PRESETS } from './TomatoGraphic'

interface Props {
  settings: PomodoroSettings
  saving: boolean
  onSave: (patch: Partial<PomodoroSettings>) => Promise<void>
  onClose: () => void
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const parsed = Number(e.target.value)
            if (Number.isFinite(parsed)) onChange(parsed)
          }}
          className="w-16 px-2.5 py-1.5 rounded-xl text-xs text-right tabular-nums outline-none"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
        <span className="text-[11px] w-7" style={{ color: 'var(--text-muted)' }}>
          {unit}
        </span>
      </span>
    </label>
  )
}

export function PomodoroSettingsModal({ settings, saving, onSave, onClose }: Props) {
  const [focus, setFocus] = useState(settings.focus_minutes)
  const [shortBreak, setShortBreak] = useState(settings.short_break_minutes)
  const [longBreak, setLongBreak] = useState(settings.long_break_minutes)
  const [interval, setInterval] = useState(settings.long_break_interval)
  const [dailyGoal, setDailyGoal] = useState(settings.daily_goal)
  const [soundEnabled, setSoundEnabled] = useState(settings.sound_enabled)
  const [wakeLockEnabled, setWakeLockEnabled] = useState(settings.wake_lock_enabled)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSave({
      focus_minutes: Math.max(5, Math.min(120, Math.round(focus))),
      short_break_minutes: Math.max(1, Math.min(30, Math.round(shortBreak))),
      long_break_minutes: Math.max(5, Math.min(60, Math.round(longBreak))),
      long_break_interval: Math.max(2, Math.min(8, Math.round(interval))),
      daily_goal: Math.max(1, Math.min(24, Math.round(dailyGoal))),
      sound_enabled: soundEnabled,
      wake_lock_enabled: wakeLockEnabled,
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 18, 24, 0.48)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-5 space-y-4 shadow-xl animate-msg-in"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} style={{ color: 'var(--accent)' }} />
            <h3 className="text-sm font-semibold">专注节奏设置</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer hover:bg-(--bg-hover)"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
            快捷档位
          </p>
          <div className="grid grid-cols-3 gap-2">
            {POMODORO_PRESETS.map((p) => {
              const active = focus === p.focus && shortBreak === p.shortBreak
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setFocus(p.focus)
                    setShortBreak(p.shortBreak)
                    setLongBreak(p.longBreak)
                  }}
                  className="rounded-xl px-2.5 py-2 text-left transition-colors pressable cursor-pointer"
                  style={{
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? 'var(--accent-contrast)' : 'var(--text-primary)',
                  }}
                >
                  <div className="text-xs font-semibold">{p.label}</div>
                  <div
                    className="text-[10.5px] mt-0.5 truncate"
                    style={{ opacity: active ? 0.85 : 0.65 }}
                  >
                    {p.subtitle}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div
          className="rounded-xl px-3.5 py-2 divide-y"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <NumberField label="专注时长" unit="分钟" value={focus} min={5} max={120} onChange={setFocus} />
          <NumberField label="短休息" unit="分钟" value={shortBreak} min={1} max={30} onChange={setShortBreak} />
          <NumberField label="长休息" unit="分钟" value={longBreak} min={5} max={60} onChange={setLongBreak} />
          <NumberField label="长休间隔" unit="轮" value={interval} min={2} max={8} onChange={setInterval} />
          <NumberField label="每日番茄目标" unit="颗" value={dailyGoal} min={1} max={24} onChange={setDailyGoal} />
        </div>

        <div className="space-y-2">
          <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
            <span className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <Volume2 size={14} />
              计时结束柔和铃声提醒
            </span>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="accent-(--accent) w-4 h-4 cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
            <span className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <Zap size={14} />
              专注期间保持屏幕常亮（书桌模式）
            </span>
            <input
              type="checkbox"
              checked={wakeLockEnabled}
              onChange={(e) => setWakeLockEnabled(e.target.checked)}
              className="accent-(--accent) w-4 h-4 cursor-pointer"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-medium cursor-pointer hover:bg-(--bg-hover)"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium cursor-pointer pressable disabled:opacity-60"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            保存设置
          </button>
        </div>
      </form>
    </div>
  )
}
