import { useEffect, useState } from 'react'
import { ChevronRight, Eye, EyeOff, Plus, Wallet } from 'lucide-react'
import { api, type LedgerOverview } from '../../api/client'
import { LEDGER_UPDATED_EVENT } from '../../utils/portalRoute'
import { errorMessage, money, monthLabel, todayMonth } from './ledger/ledgerMeta'
import { QuickLedgerModal } from './ledger/QuickLedgerModal'
import { useAnimatedMoney, useAnimatedNumber } from './ledger/useAnimatedNumber'
import { HubCard, HubTextButton } from './WorkbenchHubCard'

function maskKey(userId: string): string {
  return `donut_ledger_masked_${userId}`
}

function readMasked(userId: string): boolean {
  try {
    return localStorage.getItem(maskKey(userId)) === '1'
  } catch {
    return false
  }
}

/** Every figure on the card goes through the mask so the hidden state can never be bypassed. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function BudgetMeter({ pct, over }: { pct: number; over: boolean }) {
  const width = Math.min(100, Math.max(0, pct))
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
      <div
        className="h-full rounded-full animate-bar-grow"
        style={{ width: `${width}%`, background: over ? 'var(--danger)' : 'var(--accent)' }}
      />
    </div>
  )
}

/** This month at a glance. Stays live through LEDGER_UPDATED_EVENT (e.g. the global quick capture). */
export function WorkbenchLedgerPreview({
  userId,
  onToast,
  onOpenQuickLedger,
  onOpenLedger,
}: {
  userId: string
  onToast?: (msg: string) => void
  /** Global capture when the app provides one; otherwise the card opens its own. */
  onOpenQuickLedger?: () => void
  onOpenLedger: () => void
}) {
  const [data, setData] = useState<LedgerOverview | null>(null)
  const [failed, setFailed] = useState(false)
  const [masked, setMasked] = useState(() => readMasked(userId))
  const [localCapture, setLocalCapture] = useState(false)
  /** Bumped by the retry link after a failed load. */
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    const load = () => {
      api
        .getLedger(todayMonth())
        .then((res) => alive && (setData(res), setFailed(false)))
        .catch(() => alive && setFailed(true))
    }
    load()
    window.addEventListener(LEDGER_UPDATED_EVENT, load)
    return () => {
      alive = false
      window.removeEventListener(LEDGER_UPDATED_EVENT, load)
    }
  }, [attempt])

  const summary = data?.summary
  const total = useAnimatedMoney(summary?.month_total ?? 0, masked, 0)
  const dailyAvg = useAnimatedMoney(summary?.daily_avg ?? 0, masked, 0)
  const count = useAnimatedNumber(summary?.count ?? 0)
  const budget = summary?.budget ?? 0
  const over = budget > 0 && (summary?.budget_pct ?? 0) > 100

  function toggleMask() {
    const next = !masked
    setMasked(next)
    try {
      localStorage.setItem(maskKey(userId), next ? '1' : '0')
    } catch {
      // storage disabled: the mask still holds for this visit
    }
  }

  const openQuick = onOpenQuickLedger || (() => setLocalCapture(true))

  return (
    <>
      <HubCard
        icon={Wallet}
        title="随手记账"
        testId="workbench-ledger-card"
        badge={data ? monthLabel(data.month) : undefined}
        action={
          <button
            type="button"
            data-testid="workbench-ledger-mask"
            onClick={toggleMask}
            aria-label={masked ? '显示金额' : '隐藏金额'}
            title={masked ? '显示金额' : '隐藏金额'}
            className="p-1.5 rounded-lg sidebar-row pressable cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            {masked ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        }
        footer={
          <>
            <button
              type="button"
              data-testid="workbench-ledger-quick"
              onClick={openQuick}
              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-opacity pressable cursor-pointer hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
            >
              <Plus size={13} />
              随手记一笔
            </button>
            <button
              type="button"
              data-testid="workbench-ledger-open"
              onClick={onOpenLedger}
              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors pressable cursor-pointer hover:bg-(--bg-hover)"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
            >
              进入账本
              <ChevronRight size={13} />
            </button>
          </>
        }
      >
        {failed && !data ? (
          <p className="py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="py-4 block">暂时无法加载账本数据</span>
            <HubTextButton onClick={() => setAttempt((n) => n + 1)}>重试</HubTextButton>
          </p>
        ) : (
          <div className={data ? '' : 'ledger-refreshing'}>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  本月支出
                </div>
                <div className="text-[28px] leading-tight font-semibold tracking-tight tabular-nums truncate">
                  {data ? total : '—'}
                </div>
              </div>
              <div className="flex gap-4 shrink-0 pb-0.5">
                <Stat label="日均" value={data ? dailyAvg : '—'} />
                <Stat label="笔数" value={data ? `${count}` : '—'} />
              </div>
            </div>
            {data && budget > 0 && (
              <div className="mt-3 space-y-1.5">
                <BudgetMeter key={`${data.month}-${budget}`} pct={summary?.budget_pct ?? 0} over={over} />
                <div className="flex justify-between text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  <span>
                    预算 {money(budget, masked)} · 已用 {Math.round(summary?.budget_pct ?? 0)}%
                  </span>
                  <span style={over ? { color: 'var(--danger)' } : undefined}>
                    {over ? '已超支' : `剩余 ${money(summary?.budget_remaining ?? 0, masked)}`}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </HubCard>

      {localCapture && (
        <QuickLedgerModal
          userId={userId}
          onClose={() => setLocalCapture(false)}
          onOpenLedgerPage={() => {
            setLocalCapture(false)
            onOpenLedger()
          }}
          onSaved={(saved) => {
            setLocalCapture(false)
            onToast?.(saved > 0 ? `已记入 ${saved} 笔` : '这几笔之前已经记过，没有重复保存')
          }}
        />
      )}
    </>
  )
}
