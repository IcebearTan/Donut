import { X } from 'lucide-react'
import type { LedgerDraftItem } from '../../../api/client'
import { LedgerTag } from './LedgerUi'
import { dayLabel, money } from './ledgerMeta'

export type LedgerPreviewItem = LedgerDraftItem & { duplicate?: boolean }

/**
 * Confirmation list shown BEFORE anything is saved. Deliberately renders only the
 * PII-stripped date / amount / category / merchant; notes and raw text never appear here.
 */
export function LedgerPreviewStrip({
  items,
  masked,
  limit,
  onRemove,
}: {
  items: LedgerPreviewItem[]
  masked: boolean
  /** Show only the first N rows (bill imports can contain thousands). */
  limit?: number
  onRemove?: (index: number) => void
}) {
  const shown = typeof limit === 'number' ? items.slice(0, limit) : items
  const hiddenCount = items.length - shown.length
  return (
    <div
      data-testid="ledger-preview-strip"
      className="rounded-2xl overflow-hidden animate-msg-in"
      style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="space-y-0.5 px-3 pt-2.5 pb-1.5">
        <div className="text-xs font-medium">识别结果 · {items.length} 笔</div>
        <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          保存前只展示日期、金额、分类、商户；单号、手机号与卡号在解析时已自动剔除。
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {shown.map((item, index) => (
          <div
            key={`${item.occurred_date}-${item.amount}-${item.merchant}-${index}`}
            className="grid grid-cols-[3.25rem_4.75rem_auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-xs"
            style={{ borderTop: '1px solid var(--border-subtle)', opacity: item.duplicate ? 0.5 : 1 }}
          >
            <span className="tabular-nums shrink-0" title={item.occurred_date} style={{ color: 'var(--text-secondary)' }}>
              {dayLabel(item.occurred_date)}
            </span>
            <span className="text-right tabular-nums font-medium shrink-0">{money(item.amount, masked)}</span>
            <LedgerTag>{item.category}</LedgerTag>
            <span className="truncate" title={item.merchant || undefined}>
              {item.merchant || '未识别到商户'}
              {item.duplicate && <span style={{ color: 'var(--text-muted)' }}> · 已入账</span>}
            </span>
            {onRemove && (
              <button
                type="button"
                aria-label="移除这一笔"
                onClick={() => onRemove(index)}
                className="p-1 rounded-lg sidebar-row cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <div className="px-3 py-2 text-[11.5px]" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
          仅显示前 {shown.length} 笔，其余 {hiddenCount} 笔导入后可在账目列表中查看。
        </div>
      )}
    </div>
  )
}
