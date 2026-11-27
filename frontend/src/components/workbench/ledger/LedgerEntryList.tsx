import { Loader2, Plus, Search, X } from 'lucide-react'
import type { LedgerEntry } from '../../../api/client'
import { LedgerEntryRow } from './LedgerEntryRow'
import {
  LEDGER_CATEGORIES,
  LEDGER_SLIDE_CLASS,
  ledgerInputStyle,
  ledgerSurfaceStyle,
  ledgerStaggerStep,
  type LedgerSlideDir,
} from './ledgerMeta'

const iconButtonStyle = { color: 'var(--text-muted)' }

/** Entries card: category chips + search on top, the month's rows underneath. */
export function LedgerEntryList({
  entries,
  masked,
  loading,
  busyId,
  confirmingId,
  category,
  search,
  monthKey,
  refreshTick,
  slideDir,
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
  /** Shown month; with `refreshTick` it re-keys the rows so they stagger in again. */
  monthKey: string
  refreshTick: number
  slideDir: LedgerSlideDir
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
  const monthEmpty = entries.length === 0
  return (
    <div
      data-testid="ledger-list-card"
      className={`rounded-3xl overflow-hidden ${loading ? 'ledger-refreshing' : ''}`}
      style={ledgerSurfaceStyle}
    >
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
        <div className="relative shrink-0 sm:ml-auto sm:w-44">
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
      </div>

      {visible.length === 0 ? (
        <div className="py-12 px-4 text-center space-y-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Loader2 size={15} className="animate-spin" />
              <span>正在加载账目…</span>
            </div>
          ) : (
            <>
              <div className="text-sm font-medium">{monthEmpty ? '这个月还没有账目' : '没有匹配的账目'}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {monthEmpty ? '在上方随手记一句，或导入微信 / 支付宝账单' : '换一个分类或搜索词试试'}
              </div>
              {monthEmpty && (
                <button
                  type="button"
                  data-testid="ledger-empty-add"
                  onClick={onAdd}
                  className="mt-1 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium sidebar-row pressable cursor-pointer"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                >
                  <Plus size={13} />
                  <span>手动记一笔</span>
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div key={`${monthKey}-${refreshTick}`} className={LEDGER_SLIDE_CLASS[slideDir]}>
          {visible.map((entry, index) => (
            <LedgerEntryRow
              key={entry.id}
              entry={entry}
              masked={masked}
              busy={busyId === entry.id}
              confirming={confirmingId === entry.id}
              stagger={ledgerStaggerStep(index)}
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
