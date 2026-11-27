import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { ledgerAccentButtonStyle } from './LedgerPrimitives'
import { ledgerInputStyle, monthLabel, shiftMonth, todayMonth } from './ledgerMeta'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
/** The year picker never goes below this, even for an empty ledger. */
const FLOOR_YEAR = 2020

/** Newest month that can be opened: twelve months past the current one (the header's `>` guard). */
export function latestSelectableMonth(): string {
  return shiftMonth(todayMonth(), 12)
}

function yearOf(month: string): number {
  const year = Number(month.slice(0, 4))
  return Number.isInteger(year) && year >= FLOOR_YEAR ? year : new Date().getFullYear()
}

const iconStyle = { color: 'var(--text-muted)' }
const yearButtonStyle = { color: 'var(--text-secondary)' }

type Props = {
  /** Selected month, `YYYY-MM`. */
  value: string
  /** Months that hold at least one entry; each gets a dot under its number. */
  availableMonths: string[]
  disabled?: boolean
  onChange: (month: string) => void
}

/** Year stepper + 4x3 month grid with "has entries" dots; closes on outside click or Escape. */
export function LedgerMonthPopover({ value, availableMonths, disabled = false, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => yearOf(value))
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const today = todayMonth()
  const recordYears = availableMonths.map((m) => Number(m.slice(0, 4))).filter((y) => y >= FLOOR_YEAR)
  const minYear = Math.min(FLOOR_YEAR, ...recordYears)
  const maxYear = Number(today.slice(0, 4)) + 1
  const latest = latestSelectableMonth()
  const withRecords = new Set(availableMonths)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function pick(month: string) {
    setOpen(false)
    onChange(month)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid="ledger-month-trigger"
        aria-label="选择月份"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setViewYear(yearOf(value))
          setOpen((cur) => !cur)
        }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-semibold pressable cursor-pointer disabled:opacity-60"
        style={ledgerInputStyle}
      >
        <Calendar size={14} style={iconStyle} />
        <span className="tabular-nums">{monthLabel(value)}</span>
        <ChevronDown size={13} style={iconStyle} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="选择月份"
          data-testid="ledger-month-popover"
          className="absolute left-0 top-full mt-2 z-30 w-[268px] rounded-2xl p-3 animate-pop-up"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-md)' }}
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <button
              type="button"
              aria-label="上一年"
              disabled={viewYear <= minYear}
              onClick={() => setViewYear((y) => y - 1)}
              className="p-1 rounded-lg sidebar-row pressable cursor-pointer disabled:opacity-30"
              style={yearButtonStyle}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold tabular-nums">{viewYear} 年</span>
            <button
              type="button"
              aria-label="下一年"
              disabled={viewYear >= maxYear}
              onClick={() => setViewYear((y) => y + 1)}
              className="p-1 rounded-lg sidebar-row pressable cursor-pointer disabled:opacity-30"
              style={yearButtonStyle}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {MONTHS.map((m) => {
              const month = `${viewYear}-${String(m).padStart(2, '0')}`
              const selected = month === value
              const future = month > latest
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${viewYear} 年 ${m} 月`}
                  disabled={future}
                  onClick={() => pick(month)}
                  className={`h-10 rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-medium border pressable cursor-pointer disabled:cursor-not-allowed disabled:opacity-35 ${
                    selected ? '' : month === today ? 'border-[var(--border-strong)]' : 'border-transparent'
                  }`}
                  style={selected ? ledgerAccentButtonStyle : future ? { color: 'var(--text-muted)' } : undefined}
                >
                  <span>{m}月</span>
                  {withRecords.has(month) ? (
                    <span
                      className="w-1 h-1 rounded-full"
                      style={{ background: selected ? 'var(--accent-contrast)' : 'var(--accent)' }}
                    />
                  ) : (
                    <span className="w-1 h-1" />
                  )}
                </button>
              )
            })}
          </div>

          <div
            className="flex items-center justify-between mt-2 pt-2 text-[11.5px]"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <span style={{ color: 'var(--text-muted)' }}>已有 {availableMonths.length} 个月记录</span>
            <button
              type="button"
              onClick={() => pick(today)}
              className="font-medium pressable cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              回到本月
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
