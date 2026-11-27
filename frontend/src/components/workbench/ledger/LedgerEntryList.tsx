import { Check, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import type { LedgerEntry } from '../../../api/client'
import { LedgerTag } from './LedgerUi'
import {
  dayLabel,
  entryTitle,
  LEDGER_CATEGORIES,
  LEDGER_SOURCE_LABELS,
  ledgerInputStyle,
  ledgerSurfaceStyle,
  money,
} from './ledgerMeta'

const iconButtonStyle = { color: 'var(--text-muted)' }

function LedgerEntryRow({
  entry,
  masked,
  busy,
  confirming,
  onEdit,
  onRequestDelete,
  onDelete,
  onCancel,
}: {
  entry: LedgerEntry
  masked: boolean
  busy: boolean
  confirming: boolean
  onEdit: (entry: LedgerEntry) => void
  onRequestDelete: (entry: LedgerEntry) => void
  onDelete: (entry: LedgerEntry) => void
  onCancel: () => void
}) {
  return (
    <div
      data-testid={`ledger-entry-${entry.id}`}
      className="group flex items-center gap-3 px-4 py-3"
      style={{ borderBottom: '1px solid var(--border-subtle)', opacity: busy ? 0.55 : 1 }}
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
              className="p-1.5 rounded-lg sidebar-row cursor-pointer disabled:opacity-50"
              style={{ color: 'var(--danger)' }}
              title="确认删除"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-lg sidebar-row cursor-pointer"
              style={iconButtonStyle}
              title="取消"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid={`ledger-edit-${entry.id}`}
              onClick={() => onEdit(entry)}
              className="p-1.5 rounded-lg sidebar-row cursor-pointer lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
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
              className="p-1.5 rounded-lg sidebar-row cursor-pointer lg:opacity-0 lg:group-hover:opacity-100 transition-opacity disabled:opacity-50"
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

/** Entries card: category chips + search on top, the month's rows underneath. */
export function LedgerEntryList({
  entries,
  masked,
  loading,
  busyId,
  confirmingId,
  category,
  search,
  onCategory,
  onSearch,
  onAdd,
  onEdit,
  onRequestDelete,
  onDelete,
  onCancelDelete,
}: {
  /** Every entry of the selected month (filters are applied here). */
  entries: LedgerEntry[]
  masked: boolean
  loading: boolean
  busyId: string | null
  confirmingId: string | null
  category: string
  search: string
  onCategory: (next: string) => void
  onSearch: (next: string) => void
  onAdd: () => void
  onEdit: (entry: LedgerEntry) => void
  /** Trash icon: only arms the inline confirmation. */
  onRequestDelete: (entry: LedgerEntry) => void
  /** Check icon: performs the deletion. */
  onDelete: (entry: LedgerEntry) => void
  onCancelDelete: () => void
}) {
  const present = LEDGER_CATEGORIES.filter((name) => entries.some((e) => e.category === name))
  const query = search.trim().toLowerCase()
  const visible = query || category
    ? entries.filter(
        (e) =>
          (!category || e.category === category) &&
          (!query || `${e.merchant} ${e.note} ${e.category}`.toLowerCase().includes(query)),
      )
    : entries
  return (
    <div data-testid="ledger-list-card" className="rounded-3xl overflow-hidden" style={ledgerSurfaceStyle}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)' }}>
        <div className="flex gap-1.5 overflow-x-auto min-w-0 py-0.5">
          <button
            type="button"
            onClick={() => onCategory('')}
            className="px-2.5 py-1 rounded-full text-[11.5px] font-medium shrink-0 pressable cursor-pointer"
            style={category === '' ? { background: 'var(--accent)', color: 'var(--accent-contrast)' } : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            全部
          </button>
          {present.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onCategory(category === name ? '' : name)}
              className="px-2.5 py-1 rounded-full text-[11.5px] font-medium shrink-0 pressable cursor-pointer"
              style={category === name ? { background: 'var(--accent)', color: 'var(--accent-contrast)' } : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
          <div className="relative flex-1 sm:w-44">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input
              data-testid="ledger-search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="搜索商户或备注"
              className="w-full pl-8 pr-7 py-1.5 rounded-full text-xs outline-none"
              style={ledgerInputStyle}
            />
            {search && (
              <button type="button" aria-label="清空搜索" onClick={() => onSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer" style={iconButtonStyle}>
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            data-testid="ledger-add-entry"
            onClick={onAdd}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium pressable cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            <Plus size={13} />
            <span>记一笔</span>
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-12 px-4 text-center space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Loader2 size={15} className="animate-spin" />
              <span>正在加载账目…</span>
            </div>
          ) : (
            <>
              <div className="text-sm font-medium">{entries.length === 0 ? '这个月还没有账目' : '没有匹配的账目'}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {entries.length === 0 ? '在上方随手记一句，或导入微信 / 支付宝账单' : '换一个分类或搜索词试试'}
              </div>
            </>
          )}
        </div>
      ) : (
        <div>
          {visible.map((entry) => (
            <LedgerEntryRow
              key={entry.id}
              entry={entry}
              masked={masked}
              busy={busyId === entry.id}
              confirming={confirmingId === entry.id}
              onEdit={onEdit}
              onRequestDelete={onRequestDelete}
              onDelete={onDelete}
              onCancel={onCancelDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
