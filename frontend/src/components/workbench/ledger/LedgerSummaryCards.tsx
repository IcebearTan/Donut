import { ChartPie, Coffee, PiggyBank } from 'lucide-react'
import type { LedgerOverview } from '../../../api/client'
import { LedgerSectionTitle, LedgerStatTile } from './LedgerPrimitives'
import { ledgerSurfaceStyle, LEDGER_SLIDE_CLASS, money, type LedgerSlideDir } from './ledgerMeta'
import { useAnimatedMoney, useAnimatedNumber } from './useAnimatedNumber'

const BAR_GROW_DELAYS = [0, 35, 70]

/** Keyframes-driven like every other chart, so the budget meter replays on each refresh. */
function BudgetMeter({ pct, over }: { pct: number; over: boolean }) {
  const used = Math.min(100, pct)
  return (
    <div
      role="progressbar"
      aria-label="预算使用进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(used)}
      className="h-2 rounded-full overflow-hidden"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <div
        className="h-full rounded-full animate-bar-grow"
        style={{ width: `${used}%`, background: over ? 'var(--danger)' : 'var(--accent)' }}
      />
    </div>
  )
}

/** Gentle budget meter: fill turns to the danger token only when the budget is exceeded. */
function BudgetCard({
  data,
  masked,
  pct,
  remaining,
  allowance,
  onOpenSettings,
}: {
  data: LedgerOverview
  masked: boolean
  pct: number
  /** Animated `budget_remaining`; may be negative while a budget is exceeded. */
  remaining: number
  allowance: string
  onOpenSettings: () => void
}) {
  const { summary } = data
  if (summary.budget <= 0) {
    return (
      <div className="rounded-3xl p-4 space-y-2.5" style={ledgerSurfaceStyle}>
        <LedgerSectionTitle icon={<PiggyBank size={13} />} title="月度预算" />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          还没有设置预算。设一个宽松的数字，这里会帮你算出每天还能花多少。
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="px-3 py-1.5 rounded-full text-xs font-medium pressable cursor-pointer"
          style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
        >
          设置预算
        </button>
      </div>
    )
  }
  const over = summary.budget_remaining < 0
  return (
    <div className="rounded-3xl p-4 space-y-3" style={ledgerSurfaceStyle}>
      <LedgerSectionTitle
        icon={<PiggyBank size={13} />}
        title="月度预算"
        extra={
          <button type="button" onClick={onOpenSettings} className="text-xs hover:underline cursor-pointer" style={{ color: 'var(--text-muted)' }}>
            调整
          </button>
        }
      />
      <BudgetMeter pct={summary.budget_pct} over={over} />
      <div className="flex items-baseline justify-between text-xs">
        <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>已用 {pct}%</span>
        <span className="font-medium tabular-nums">
          {over ? `超出 ${money(Math.abs(remaining), masked)}` : `剩余 ${money(remaining, masked)}`}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {over
          ? '本月预算已用完。记下来就好，下月再把数字调得更贴近生活。'
          : `接下来每天花 ${allowance} 以内，就能稳稳落在预算里。`}
      </p>
    </div>
  )
}

/** Horizontal magnitude bars (single hue, value at the tip in text tokens). */
function CategoryBars({ data, masked }: { data: LedgerOverview; masked: boolean }) {
  if (data.categories.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>本月还没有账目，在上方随手记一句或点「记一笔」。</p>
  }
  return (
    <div className="space-y-2.5">
      {data.categories.map((cat, index) => (
        <div key={cat.name} className="flex items-center gap-2.5 text-xs" title={`${cat.name} · ${cat.count} 笔`}>
          <span className="w-14 shrink-0 truncate">{cat.name}</span>
          <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
            <div
              className="h-full rounded-full animate-bar-grow"
              style={{
                width: `${Math.min(100, cat.pct)}%`,
                background: 'var(--accent)',
                animationDelay: `${BAR_GROW_DELAYS[Math.min(index, BAR_GROW_DELAYS.length - 1)]}ms`,
              }}
            />
          </div>
          <span className="w-[6.5rem] text-right tabular-nums shrink-0">{money(cat.total, masked)}</span>
          <span className="w-10 text-right tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>{cat.pct}%</span>
        </div>
      ))}
    </div>
  )
}

/** "拿铁因子" pills: frequent, small habitual spends. Informational, never shaming. */
function LeakPills({ data, masked }: { data: LedgerOverview; masked: boolean }) {
  if (data.hidden_leaks.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>本月没有明显的小额高频支出。</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {data.hidden_leaks.map((leak, index) => (
        <span
          key={leak.label}
          title={`均笔 ${money(leak.avg, masked)}`}
          className="px-2.5 py-1 rounded-full text-[11px] tabular-nums animate-stagger-in"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            animationDelay: `${index * 24}ms`,
          }}
        >
          {leak.label} · {leak.count} 次 · {money(leak.total, masked)}
        </span>
      ))}
    </div>
  )
}

/**
 * Anti-anxiety KPIs: one hero figure, a gentle budget meter, category bars and habit pills.
 * `refreshTick` re-keys the grid so every figure, bar and pill replays on each load.
 */
export function LedgerSummaryCards({
  data,
  masked,
  loading,
  refreshTick,
  slideDir,
  onOpenSettings,
}: {
  data: LedgerOverview
  masked: boolean
  /** True while another month is loading; the previous figures stay on screen, softly dimmed. */
  loading: boolean
  refreshTick: number
  slideDir: LedgerSlideDir
  onOpenSettings: () => void
}) {
  const { summary } = data
  const animated = { disabled: masked, replayKey: refreshTick }
  const monthTotal = useAnimatedMoney(summary.month_total, masked, refreshTick)
  const dailyAvg = useAnimatedMoney(summary.daily_avg, masked, refreshTick)
  const count = useAnimatedNumber(summary.count, animated)
  const budgetPct = useAnimatedNumber(summary.budget_pct, animated)
  const budgetRemaining = useAnimatedNumber(summary.budget_remaining, animated)
  const dailyAllowance = useAnimatedMoney(summary.daily_allowance, masked, refreshTick)

  return (
    <div data-testid="ledger-summary" className={loading ? 'ledger-refreshing' : undefined}>
      <div key={refreshTick} className={`grid gap-4 lg:grid-cols-2 ${LEDGER_SLIDE_CLASS[slideDir]}`}>
        <div className="space-y-4">
          <div className="rounded-3xl p-4 sm:p-5 space-y-3.5" style={ledgerSurfaceStyle}>
            <div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>本月支出</div>
              <div data-testid="ledger-month-total" className="text-4xl sm:text-5xl font-semibold tracking-tight mt-1 tabular-nums">
                {monthTotal}
              </div>
            </div>
            <div className="flex gap-2.5">
              <LedgerStatTile label="日均支出" value={dailyAvg} />
              <LedgerStatTile label="记账笔数" value={`${Math.round(count)} 笔`} />
            </div>
          </div>
          <BudgetCard
            data={data}
            masked={masked}
            pct={Math.max(0, Math.round(budgetPct))}
            remaining={budgetRemaining}
            allowance={dailyAllowance}
            onOpenSettings={onOpenSettings}
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl p-4 sm:p-5 space-y-3" style={ledgerSurfaceStyle}>
            <LedgerSectionTitle icon={<ChartPie size={13} />} title="分类分布" />
            <CategoryBars data={data} masked={masked} />
          </div>
          <div className="rounded-3xl p-4 sm:p-5 space-y-3" style={ledgerSurfaceStyle}>
            <div className="space-y-0.5">
              <LedgerSectionTitle icon={<Coffee size={13} />} title="小额高频提醒" />
              <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                次数多、单笔小的习惯性支出，看见就好，不必自责。
              </p>
            </div>
            <LeakPills data={data} masked={masked} />
          </div>
        </div>
      </div>
    </div>
  )
}
