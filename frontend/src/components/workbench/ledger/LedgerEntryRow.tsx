import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react'
import type { LedgerEntry } from '../../../api/client'
import { LedgerTag } from './LedgerUi'
import { dayLabel, entryTitle, LEDGER_SOURCE_LABELS, money } from './ledgerMeta'

const iconButtonStyle = { color: 'var(--text-muted)' }
/** Pause between two neighbouring rows while they stagger in. */
const STAGGER_STEP_MS = 24

/** One entry line: date, title, tags, amount and the inline edit / delete confirmation. */
export function LedgerEntryRow({
  entry,
  masked,
  busy,
  confirming,
  stagger,
  onEdit,
  onRequestDelete,
  onDelete,
  onCancel,
}: {
  entry: LedgerEntry
  masked: boolean
  busy: boolean
  confirming: boolean
  /** Step from `ledgerStaggerStep` driving the entrance delay; `-1` marks a row that just appears. */
  stagger: number
  onEdit: (entry: LedgerEntry) => void
  /** Trash icon: only arms the inline confirmation. */
  onRequestDelete: (entry: LedgerEntry) => void
  /** Check icon: performs the deletion. */
  onDelete: (entry: LedgerEntry) => void
  onCancel: () => void
}) {
  const rowButtonClass = 'p-1.5 rounded-lg sidebar-row cursor-pointer'
  return (
    <div
      data-testid={`ledger-entry-${entry.id}`}
      className={`group flex items-center gap-3 px-4 py-3 ${stagger >= 0 ? 'animate-stagger-in' : ''}`}
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        opacity: busy ? 0.55 : 1,
        animationDelay: stagger >= 0 ? `${stagger * STAGGER_STEP_MS}ms` : undefined,
      }}
    >
      <div className="w-10 shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-muted)' }} title={entry.occurred_date}>
        {dayLabel(entry.occurred_date)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{entryTitle(entry)}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          <LedgerTag>{entry.category}</LedgerTag>
          {entry.payment_method && <span>{entry.payment_method}</span>}
          <span>{LEDGER_SOURCE_LABELS[entry.source] || entry.source}</span>
        </div>
      </div>
      <span className="text-sm font-semibold tabular-nums shrink-0">{money(entry.amount, masked)}</span>
      <div className="flex items-center gap-0.5 shrink-0">
        {confirming ? (
          <>
            <button
              type="button"
              data-testid={`ledger-delete-confirm-${entry.id}`}
              disabled={busy}
              onClick={() => onDelete(entry)}
              className={`${rowButtonClass} disabled:opacity-50`}
              style={{ color: 'var(--danger)' }}
              title="确认删除"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button type="button" onClick={onCancel} className={rowButtonClass} style={iconButtonStyle} title="取消">
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid={`ledger-edit-${entry.id}`}
              onClick={() => onEdit(entry)}
              className={`${rowButtonClass} lg:opacity-0 lg:group-hover:opacity-100 transition-opacity`}
              style={iconButtonStyle}
              title="编辑"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              data-testid={`ledger-delete-${entry.id}`}
              disabled={busy}
              onClick={() => onRequestDelete(entry)}
              className={`${rowButtonClass} lg:opacity-0 lg:group-hover:opacity-100 transition-opacity disabled:opacity-50`}
              style={iconButtonStyle}
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
