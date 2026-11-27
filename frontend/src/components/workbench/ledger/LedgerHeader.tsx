import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff, Plus, RefreshCw, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { LedgerMonthPopover, latestSelectableMonth } from './LedgerMonthPopover'
import { LedgerPillButton } from './LedgerPrimitives'
import { ledgerSurfaceStyle, todayMonth } from './ledgerMeta'

const roundButtonStyle = {
  background: 'var(--bg-sidebar)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)',
}

const roundButtonClass = 'w-8 h-8 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer disabled:opacity-40'

/** Month switcher + privacy mask + the primary "add an entry" call to action. */
export function LedgerHeader({
  shownMonth,
  availableMonths,
  loading,
  strictOffline,
  masked,
  onMonth,
  onStep,
  onRefresh,
  onToggleMask,
  onOpenPrivacy,
  onAdd,
}: {
  /** Month shown in the switcher; `''` until the first load picks one. */
  shownMonth: string
  /** Months that hold at least one entry (dots in the month popover). */
  availableMonths: string[]
  loading: boolean
  strictOffline: boolean
  masked: boolean
  onMonth: (month: string) => void
  onStep: (delta: 1 | -1) => void
  onRefresh: () => void
  onToggleMask: () => void
  onOpenPrivacy: () => void
  onAdd: () => void
}) {
  const ready = Boolean(shownMonth)
  const today = todayMonth()
  const stepButton = (delta: 1 | -1, label: string, icon: ReactNode, disabled: boolean) => (
    <button type="button" aria-label={label} disabled={disabled} onClick={() => onStep(delta)} className={roundButtonClass} style={roundButtonStyle}>
      {icon}
    </button>
  )

  return (
    <div
      data-testid="ledger-header"
      className="rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      style={ledgerSurfaceStyle}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {stepButton(-1, '上一个月', <ChevronLeft size={15} />, !ready)}
        <LedgerMonthPopover value={shownMonth} availableMonths={availableMonths} disabled={!ready} onChange={onMonth} />
        {stepButton(1, '下一个月', <ChevronRight size={15} />, !ready || shownMonth >= latestSelectableMonth())}
        {ready && shownMonth !== today && (
          <button
            type="button"
            data-testid="ledger-back-to-today"
            onClick={() => onMonth(today)}
            className="px-2.5 py-1 rounded-full text-[11.5px] font-medium pressable cursor-pointer"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}
          >
            回本月
          </button>
        )}
        <button
          type="button"
          aria-label="刷新账本"
          title="刷新"
          data-testid="ledger-refresh"
          disabled={loading}
          onClick={onRefresh}
          className={roundButtonClass}
          style={roundButtonStyle}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        {strictOffline && (
          <span
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium"
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
        <button
          type="button"
          data-testid="ledger-header-add"
          onClick={onAdd}
          className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold pressable cursor-pointer"
          style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
        >
          <Plus size={14} />
          <span>记一笔</span>
        </button>
      </div>
    </div>
  )
}
