import { Flame, Trash2, Trophy } from 'lucide-react'
import type { PomodoroSession, PomodoroState } from '../../../api/client'
import { TomatoIcon } from './TomatoGraphic'

interface Props {
  state: PomodoroState
  deletingId: string | null
  justHarvested: boolean
  onDeleteSession: (sessionId: string) => void
}

function formatTimeHm(tsMs: number): string {
  const d = new Date(tsMs)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDurationText(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
}

export function PomodoroHarvestPanel({ state, deletingId, justHarvested, onDeleteSession }: Props) {
  const { summary, weekly, today_sessions: todaySessions } = state
  const goalPct = summary.daily_goal > 0
    ? Math.min(100, Math.round((summary.today_tomatoes / summary.daily_goal) * 100))
    : 0
  const basketSlots = Math.max(summary.daily_goal, summary.today_tomatoes)
  const maxWeekly = Math.max(summary.daily_goal, ...weekly.map((w) => w.tomatoes), 1)

  return (
    <div className="space-y-4">
      <section
        className="rounded-2xl p-5 space-y-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">今日番茄篮</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              每完成一次专注循环，就为你点亮一颗新鲜番茄
            </p>
          </div>
          <span
            className="px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums"
            style={{
              background: summary.today_tomatoes >= summary.daily_goal
                ? 'rgba(61, 163, 93, 0.14)'
                : 'rgba(229, 83, 75, 0.12)',
              color: summary.today_tomatoes >= summary.daily_goal ? '#3DA35D' : '#E5534B',
            }}
          >
            {summary.today_tomatoes} / {summary.daily_goal} 颗
          </span>
        </div>

        <div
          className="rounded-xl p-3.5 flex flex-wrap items-center gap-2.5 min-h-[64px]"
          style={{ background: 'var(--bg-elevated)' }}
        >
          {Array.from({ length: basketSlots }, (_, idx) => {
            const ripe = idx < summary.today_tomatoes
            const isNewest = justHarvested && idx === summary.today_tomatoes - 1
            return (
              <div
                key={idx}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform ${
                  isNewest ? 'scale-110' : ''
                }`}
                style={{
                  background: ripe ? 'var(--bg-surface)' : 'transparent',
                  boxShadow: ripe ? '0 1px 3px rgba(0,0,0,0.06)' : undefined,
                }}
                title={ripe ? `第 ${idx + 1} 颗番茄` : `今日目标第 ${idx + 1} 颗`}
              >
                <TomatoIcon size={24} variant={ripe ? 'ripe' : 'empty'} />
              </div>
            )
          })}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span>今日专注 {formatDurationText(summary.today_minutes)}</span>
            <span className="tabular-nums">目标进度 {goalPct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${goalPct}%`,
                background: goalPct >= 100 ? '#3DA35D' : '#E5534B',
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-elevated)' }}>
            <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <Flame size={12} style={{ color: '#E5534B' }} />
              连续打卡
            </div>
            <div className="mt-1 text-base font-semibold tabular-nums">{summary.streak_days} 天</div>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-elevated)' }}>
            <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <Trophy size={12} style={{ color: '#D99B26' }} />
              单日最高
            </div>
            <div className="mt-1 text-base font-semibold tabular-nums">{summary.best_day_tomatoes} 颗</div>
          </div>
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-elevated)' }}>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>累计收获</div>
            <div className="mt-1 text-base font-semibold tabular-nums">{summary.total_tomatoes} 颗</div>
          </div>
        </div>
      </section>

      <section
        className="rounded-2xl p-5 space-y-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            近 7 天专注节奏
          </h3>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            累计 {formatDurationText(summary.total_minutes)}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-2 items-end h-24 pt-2">
          {weekly.map((day) => {
            const pct = day.tomatoes > 0 ? Math.max(16, Math.round((day.tomatoes / maxWeekly) * 100)) : 6
            return (
              <div key={day.date} className="flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {day.tomatoes > 0 ? day.tomatoes : ''}
                </span>
                <div className="w-full flex-1 flex items-end justify-center">
                  <div
                    className="w-full max-w-[26px] rounded-t-lg transition-all duration-300"
                    style={{
                      height: `${pct}%`,
                      background: day.tomatoes === 0
                        ? 'var(--bg-elevated)'
                        : day.is_today
                          ? '#E5534B'
                          : 'rgba(229, 83, 75, 0.45)',
                    }}
                    title={`${day.short_date} · ${day.tomatoes} 颗番茄 (${day.minutes} 分钟)`}
                  />
                </div>
                <span
                  className="text-[10.5px]"
                  style={{
                    color: day.is_today ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: day.is_today ? 600 : 400,
                  }}
                >
                  {day.is_today ? '今日' : day.label}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <section
        className="rounded-2xl p-5 space-y-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            今日收获明细
          </h3>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {todaySessions.length} 条记录
          </span>
        </div>
        {todaySessions.length === 0 ? (
          <p className="py-5 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            今天还没有收获番茄，开启第一轮专注吧
          </p>
        ) : (
          <ul className="space-y-1.5">
            {todaySessions.map((item: PomodoroSession) => (
              <li
                key={item.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                style={{ background: 'var(--bg-elevated)' }}
              >
                <TomatoIcon size={17} variant="ripe" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{item.tag}</span>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {item.duration_minutes} 分钟
                    </span>
                  </div>
                  {item.note && (
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {item.note}
                    </p>
                  )}
                </div>
                <span className="text-[11px] tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {formatTimeHm(item.completed_at)}
                </span>
                <button
                  type="button"
                  disabled={deletingId === item.id}
                  onClick={() => onDeleteSession(item.id)}
                  title="删除这条记录"
                  className="p-1 rounded-lg cursor-pointer hover:bg-(--bg-hover) disabled:opacity-40"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
