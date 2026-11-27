import type { CSSProperties, KeyboardEvent } from 'react'
import type {
  LedgerBillSkipped,
  LedgerDraftItem,
  LedgerEntry,
  LedgerEntryInput,
  LedgerSource,
} from '../../../api/client'

/** Same order as backend CATEGORIES; anything unknown is stored as 其他 by the server. */
export const LEDGER_CATEGORIES = [
  '餐饮', '饮品零食', '交通', '购物', '日用', '娱乐', '学习', '医疗', '居住', '人情', '其他',
] as const

/** Same set as backend PAYMENT_METHODS; '' means "not specified". */
export const LEDGER_PAYMENT_METHODS = ['微信', '支付宝', '银行卡', '现金', '其他'] as const

export const LEDGER_SOURCE_LABELS: Record<LedgerSource, string> = {
  quick: '速记',
  ocr: '截图识别',
  wechat_import: '微信账单',
  alipay_import: '支付宝账单',
  manual: '手动',
}

export const LEDGER_BILL_SKIPPED_LABELS: Array<[keyof LedgerBillSkipped, string]> = [
  ['refund', '退款'],
  ['transfer', '转账 / 理财'],
  ['income', '收入'],
  ['neutral', '不计收支'],
  ['invalid', '无效行'],
]

export const LEDGER_BILL_PROVIDER_LABELS: Record<string, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
}

export const MASKED_AMOUNT = '¥****'
export const MAX_OCR_FILE_BYTES = 10 * 1024 * 1024
export const MAX_BILL_FILE_BYTES = 20 * 1024 * 1024
export const OCR_ACCEPT = 'image/png,image/jpeg,image/webp'

export const ledgerInputStyle: CSSProperties = {
  background: 'var(--bg-sidebar)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
}

export const ledgerSurfaceStyle: CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
}

/** Where freshly loaded month data slides in from: the later month sits to the right. */
export type LedgerSlideDir = 'left' | 'right' | 'none'

export const LEDGER_SLIDE_CLASS: Record<LedgerSlideDir, string> = {
  left: 'animate-slide-from-left',
  right: 'animate-slide-from-right',
  none: '',
}

/** Rows that stagger in when a month loads or refreshes. */
const STAGGER_ROWS = 12
/** Longest wait before a row starts, in 24ms steps, so a long list never trails off. */
const STAGGER_MAX_STEPS = 10

/** Stagger step of the row at `index` (multiply by 24ms), or `-1` when the row just appears. */
export function ledgerStaggerStep(index: number): number {
  return index < STAGGER_ROWS ? Math.min(index, STAGGER_MAX_STEPS) : -1
}

export function formatMoney(amount: number): string {
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Every amount in the plugin goes through here so the privacy mask can never be bypassed. */
export function money(amount: number, masked: boolean): string {
  return masked ? MASKED_AMOUNT : formatMoney(amount)
}

/** `2026-11` -> `2026 年 11 月` */
export function monthLabel(month: string): string {
  const [year, mon] = month.split('-')
  return year && mon ? `${year} 年 ${Number(mon)} 月` : month
}

/** `2026-11-27` -> `11月27日` (withYear) or `11-27` (default, used in dense rows) */
export function dayLabel(isoDate: string, withYear = false): string {
  const [year, mon, day] = isoDate.split('-')
  if (!year || !mon || !day) return isoDate
  return withYear ? `${Number(mon)}月${Number(day)}日` : `${mon}-${day}`
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number)
  if (!year || !mon) return month
  const d = new Date(Date.UTC(year, mon - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function todayMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

/** True only for a real Enter press (not the one that commits a Chinese IME composition). */
export function isPlainEnter(e: KeyboardEvent<HTMLElement>): boolean {
  return e.key === 'Enter' && !(e.nativeEvent.isComposing || e.keyCode === 229)
}

/**
 * Drop-in `onKeyDown` for Enter-to-submit inputs inside a <form>: cancels the Enter that
 * commits a Chinese IME composition so the form is not submitted with half-typed text.
 */
export function guardImeEnter(e: KeyboardEvent<HTMLElement>): void {
  if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function entryTitle(entry: Pick<LedgerEntry, 'merchant' | 'note'>): string {
  return entry.merchant || entry.note || '未填写商户'
}

/** Picks exactly the LedgerEntryPayload fields from a server-parsed draft (drops `month`). */
export function toLedgerEntryInput(item: LedgerDraftItem): LedgerEntryInput {
  return {
    occurred_date: item.occurred_date,
    amount: item.amount,
    category: item.category,
    merchant: item.merchant,
    payment_method: item.payment_method,
    note: item.note,
    source: item.source,
    fingerprint: item.fingerprint,
  }
}
