import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff, RefreshCw, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { LedgerPillButton } from './LedgerPrimitives'
import { ledgerInputStyle, ledgerSurfaceStyle, monthLabel, shiftMonth, todayMonth } from './ledgerMeta'

const roundButtonStyle = {
  background: 'var(--bg-sidebar)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)',
}

/** Month switcher + privacy mask + entry point to 隐私与设置. */
export function LedgerHeader({
  shownMonth,
  monthOptions,
  loading,
  strictOffline,
  masked,
  onMonth,
  onStep,
  onToggleMask,
  onOpenPrivacy,
}: {
  shownMonth: string
  monthOptions: string[]
  loading: boolean
  strictOffline: boolean
  masked: boolean
  onMonth: (month: string) => void
  onStep: (delta: 1 | -1) => void
  onToggleMask: () => void
  onOpenPrivacy: () => void
}) {
  const ready = Boolean(shownMonth)
  const stepButton = (delta: 1 | -1, label: string, icon: ReactNode, disabled: boolean) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => onStep(delta)}
      className="w-8 h-8 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer disabled:opacity-40"
      style={roundButtonStyle}
    >
      {icon}
    </button>
  )

  return (
    <div
      data-testid="ledger-header"
      className="rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      style={ledgerSurfaceStyle}
    >
      <div className="flex items-center gap-1.5">
        {stepButton(-1, '上一个月', <ChevronLeft size={15} />, !ready)}
        <select
          aria-label="选择月份"
          data-testid="ledger-month-select"
          value={shownMonth}
          disabled={!ready}
          onChange={(e) => onMonth(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-sm font-semibold outline-none cursor-pointer disabled:opacity-60"
          style={ledgerInputStyle}
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        {stepButton(1, '下一个月', <ChevronRight size={15} />, !ready || shownMonth >= shiftMonth(todayMonth(), 12))}
        <RefreshCw size={13} className={loading ? 'animate-spin' : 'invisible'} style={{ color: 'var(--text-muted)' }} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {strictOffline && (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            <ShieldCheck size={12} />
            <span>严格离线</span>
          </span>
        )}
        <LedgerPillButton
          testId="ledger-toggle-mask"
          pressed={masked}
          icon={masked ? <EyeOff size={13} /> : <Eye size={13} />}
          onClick={onToggleMask}
        >
          {masked ? '金额已隐藏' : '隐藏金额'}
        </LedgerPillButton>
        <LedgerPillButton
          testId="ledger-open-privacy"
          icon={<SlidersHorizontal size={13} />}
          onClick={onOpenPrivacy}
        >
          隐私与设置
        </LedgerPillButton>
      </div>
    </div>
  )
}
