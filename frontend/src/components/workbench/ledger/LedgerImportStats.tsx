import type { LedgerBillImportPreview, LedgerBillImportResult, LedgerBillSkipped } from '../../../api/client'
import { LEDGER_BILL_PROVIDER_LABELS, LEDGER_BILL_SKIPPED_LABELS, money } from './ledgerMeta'

type BillStats = LedgerBillImportPreview | LedgerBillImportResult

/** Rows the importer deliberately left out (refunds, transfers, income...), one compact line. */
function SkippedLine({ skipped }: { skipped: LedgerBillSkipped }) {
  const parts = LEDGER_BILL_SKIPPED_LABELS.filter(([key]) => skipped[key] > 0).map(
    ([key, label]) => `${label} ${skipped[key]}`,
  )
  return <span>已自动跳过：{parts.length > 0 ? parts.join(' · ') : '无'}</span>
}

/** Import feedback: provider, totals, skipped rows, then either the dry-run or the final result. */
export function LedgerImportStats({
  stats,
  masked,
}: {
  stats: BillStats
  masked: boolean
}) {
  return (
    <div className="rounded-2xl px-3.5 py-3 space-y-1.5 text-xs" style={{ background: 'var(--bg-elevated)' }}>
      <div className="font-medium">
        {LEDGER_BILL_PROVIDER_LABELS[stats.provider] || stats.provider}账单 · 可入账 {stats.count} 笔 · 合计 {money(stats.total, masked)}
      </div>
      <div style={{ color: 'var(--text-muted)' }}>
        <SkippedLine skipped={stats.skipped} />
      </div>
      {stats.dry_run ? (
        <div style={{ color: 'var(--text-secondary)' }}>
          其中 {stats.new_count} 笔是新账目，{stats.count - stats.new_count} 笔已入账（不会重复保存）。
        </div>
      ) : (
        <div data-testid="ledger-import-result" style={{ color: 'var(--success)' }}>
          导入完成：新增 {stats.inserted} 笔，跳过 {stats.skipped_duplicates} 笔重复账目。
        </div>
      )}
    </div>
  )
}
