import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  api,
  type LedgerBillImportPreview,
  type LedgerBillImportResult,
} from '../../../api/client'
import { LedgerDropZone } from './LedgerDropZone'
import { LedgerImportStats } from './LedgerImportStats'
import { LedgerGuaranteeBanner, LedgerModalFrame, LedgerNotice } from './LedgerUi'
import { LedgerPreviewStrip } from './LedgerPreviewStrip'
import { errorMessage, MAX_BILL_FILE_BYTES } from './ledgerMeta'

const PREVIEW_ROWS = 50

function validate(file: File): string {
  if (!/\.(csv|xlsx)$/i.test(file.name)) return '仅支持微信 / 支付宝导出的 CSV 或 XLSX 账单文件'
  if (file.size === 0) return '账单文件为空'
  if (file.size > MAX_BILL_FILE_BYTES) return '账单文件不能超过 20MB'
  return ''
}

/** WeChat / Alipay bill import: dry-run preview first (default) or direct import. */
export function LedgerImportModal({
  masked,
  onClose,
  onImported,
}: {
  masked: boolean
  onClose: () => void
  onImported: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<LedgerBillImportPreview | null>(null)
  const [result, setResult] = useState<LedgerBillImportResult | null>(null)
  const [previewFirst, setPreviewFirst] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const lock = useRef(false)

  function reset() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setErr('')
  }

  /** `lock` guards against a second drop arriving before React re-renders `busy`. */
  async function run(target: File, dryRun: boolean) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setErr('')
    try {
      if (dryRun) setPreview(await api.importLedgerBill(target, true))
      else {
        setResult(await api.importLedgerBill(target, false))
        setPreview(null)
        onImported()
      }
    } catch (e) {
      setErr(errorMessage(e, dryRun ? '账单解析失败' : '导入失败，请稍后再试'))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function handleFile(next: File) {
    const problem = validate(next)
    reset()
    if (problem) setErr(problem)
    else {
      setFile(next)
      run(next, previewFirst)
    }
  }

  const stats = preview || result
  return (
    <LedgerModalFrame
      testId="ledger-import-modal"
      title="导入微信 / 支付宝账单"
      subtitle="在 App 的「账单」里导出 CSV 或 XLSX 文件后拖到这里"
      busy={busy}
      onClose={onClose}
    >
      <LedgerGuaranteeBanner lines={['100% 私有服务器离线解析', '自动去重', '自动剔除单号与卡号']} />
      <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        账单只在你的私有服务器内存中解析：只保留支出、商户、金额与时间；退款、转账、理财与收入不会入账；重复导入同一份账单不会产生重复记录。
      </p>

      <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
        <span style={{ color: 'var(--text-secondary)' }}>导入前先预览（不会写入任何数据）</span>
        <input
          type="checkbox"
          checked={previewFirst}
          disabled={busy}
          onChange={(e) => {
            reset()
            setPreviewFirst(e.target.checked)
          }}
          className="w-4 h-4 cursor-pointer"
        />
      </label>

      <LedgerDropZone busy={busy} onFile={handleFile} />

      {err && <LedgerNotice tone="danger">{err}</LedgerNotice>}
      {stats && <LedgerImportStats stats={stats} masked={masked} />}
      {preview && <LedgerPreviewStrip items={preview.items} masked={masked} limit={PREVIEW_ROWS} />}

      {preview && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={reset}
            className="px-4 py-2 rounded-xl text-xs font-medium sidebar-row cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          >
            重新选择
          </button>
          <button
            type="button"
            data-testid="ledger-import-confirm"
            disabled={busy || preview.new_count === 0 || !file}
            onClick={() => file && run(file, false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            <span>确认导入 {preview.new_count} 笔</span>
          </button>
        </div>
      )}

      {result && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            完成
          </button>
        </div>
      )}
    </LedgerModalFrame>
  )
}
