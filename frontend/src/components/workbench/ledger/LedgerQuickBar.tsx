import { useRef, useState, type ClipboardEvent } from 'react'
import { Check, FileUp, ImagePlus, Loader2, ShieldCheck, X } from 'lucide-react'
import { api, type LedgerCreateResult } from '../../../api/client'
import {
  LedgerPillButton,
  ledgerAccentButtonStyle,
  ledgerPillButtonStyle,
} from './LedgerPrimitives'
import { LedgerPreviewStrip, type LedgerPreviewItem } from './LedgerPreviewStrip'
import { LedgerNotice } from './LedgerUi'
import { recognizeImages } from './ledgerOcr'
import {
  errorMessage,
  isPlainEnter,
  ledgerInputStyle,
  ledgerSurfaceStyle,
  money,
  OCR_ACCEPT,
  toLedgerEntryInput,
} from './ledgerMeta'

const NO_MATCH_HINT =
  '没有识别到金额。可以写成「午饭 25，瑞幸 16.9，昨天打车 38 微信」，用逗号分隔每一笔。'

/** Zero-friction capture: one line of text or a few screenshots -> preview -> one-click save. */
export function LedgerQuickBar({
  masked,
  onCreated,
  onOpenImport,
  onToast,
}: {
  masked: boolean
  onCreated: (res: LedgerCreateResult) => void
  onOpenImport: () => void
  onToast: (msg: string) => void
}) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<LedgerPreviewItem[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ocrProgress, setOcrProgress] = useState<{ done: number; total: number } | null>(null)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const busy = parsing || saving || ocrProgress !== null
  const total = Math.round(preview.reduce((sum, item) => sum + item.amount, 0) * 100) / 100

  async function handleQuick() {
    const value = text.trim()
    if (!value || busy) return
    setParsing(true)
    setErr('')
    try {
      const res = await api.quickParseLedger(value)
      if (res.items.length === 0) {
        setErr(NO_MATCH_HINT)
        return
      }
      setPreview(res.items)
    } catch (e) {
      setErr(errorMessage(e, '解析失败，请稍后再试'))
    } finally {
      setParsing(false)
    }
  }

  /** Screenshots go through the serial server OCR queue; sanitized results are appended to the preview. */
  async function handleImages(files: FileList | File[] | null) {
    const picked = Array.from(files || [])
    if (picked.length === 0 || ocrProgress) return
    setErr('')
    setOcrProgress({ done: 0, total: picked.length })
    const { found, failed } = await recognizeImages(picked, (done, total) => setOcrProgress({ done, total }))
    setOcrProgress(null)
    if (found.length > 0) setPreview((cur) => [...cur, ...found])
    if (failed.length > 0) setErr(failed.join('；'))
  }

  /** Ctrl+V with a payment screenshot in the clipboard goes straight to offline OCR. */
  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const images: File[] = []
    for (const item of Array.from(e.clipboardData.items)) {
      const file = item.kind === 'file' && item.type.startsWith('image/') ? item.getAsFile() : null
      if (file) images.push(file)
    }
    if (images.length === 0 || ocrProgress) return
    e.preventDefault()
    handleImages(images)
  }

  async function handleConfirm() {
    if (preview.length === 0 || busy) return
    setSaving(true)
    setErr('')
    try {
      const res = await api.createLedgerEntries(preview.map(toLedgerEntryInput))
      setPreview([])
      setText('')
      if (res.inserted.length === 0 && res.skipped > 0) onToast('这几笔之前已经记过，没有重复保存')
      onCreated(res)
    } catch (e) {
      setErr(errorMessage(e, '保存失败，请稍后再试'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="ledger-quick-bar" className="rounded-3xl p-4 sm:p-5 space-y-3" style={ledgerSurfaceStyle}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>随手记</span>
        <span className="inline-flex items-center gap-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          <ShieldCheck size={12} />
          <span>离线解析 · 不调用外部 AI · 支持 Ctrl+V 粘贴支付截图</span>
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          data-testid="ledger-quick-input"
          value={text}
          maxLength={2000}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (isPlainEnter(e)) {
              e.preventDefault()
              handleQuick()
            }
          }}
          placeholder="午饭 25，瑞幸 16.9，昨天打车 38 微信"
          title="可直接 Ctrl+V 粘贴支付截图，自动离线识别"
          className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl text-sm outline-none disabled:opacity-60"
          style={ledgerInputStyle}
        />
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            data-testid="ledger-quick-parse"
            disabled={busy}
            onClick={handleQuick}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
            style={ledgerAccentButtonStyle}
          >
            {parsing && <Loader2 size={13} className="animate-spin" />}
            <span>解析</span>
          </button>
          <LedgerPillButton
            testId="ledger-ocr-btn"
            size="md"
            disabled={busy}
            icon={<ImagePlus size={13} />}
            onClick={() => fileRef.current?.click()}
          >
            截图识别
          </LedgerPillButton>
          <LedgerPillButton
            testId="ledger-open-import"
            size="md"
            disabled={busy}
            icon={<FileUp size={13} />}
            onClick={onOpenImport}
          >
            导入账单
          </LedgerPillButton>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={OCR_ACCEPT}
        multiple
        hidden
        data-testid="ledger-ocr-file"
        onChange={(e) => {
          handleImages(e.target.files)
          e.target.value = ''
        }}
      />

      {ocrProgress && (
        <LedgerNotice tone="info">
          正在离线识别截图 {ocrProgress.done} / {ocrProgress.total}，原图只在内存中处理、不会保存。
        </LedgerNotice>
      )}
      {err && <LedgerNotice tone="danger">{err}</LedgerNotice>}

      {preview.length > 0 && (
        <div className="space-y-2">
          <LedgerPreviewStrip
            items={preview}
            masked={masked}
            onRemove={(index) => setPreview((cur) => cur.filter((_, i) => i !== index))}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              合计 <span className="font-medium tabular-nums">{money(total, masked)}</span> · 确认前可逐笔移除，分类保存后可修改
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setPreview([])}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium sidebar-row cursor-pointer disabled:opacity-50"
                style={ledgerPillButtonStyle}
              >
                <X size={13} />
                <span>取消</span>
              </button>
              <button
                type="button"
                data-testid="ledger-preview-confirm"
                disabled={saving}
                onClick={handleConfirm}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
                style={ledgerAccentButtonStyle}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>确认记入 {preview.length} 笔</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
