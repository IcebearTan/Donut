import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { Check, ImagePlus, Loader2 } from 'lucide-react'
import { api, type LedgerCreateResult } from '../../../api/client'
import { emitLedgerUpdated } from '../../../utils/portalRoute'
import { ledgerAccentButtonStyle, ledgerPillButtonStyle } from './LedgerPrimitives'
import { LedgerPreviewStrip, type LedgerPreviewItem } from './LedgerPreviewStrip'
import { LedgerNotice } from './LedgerUi'
import { recognizeImages } from './ledgerOcr'
import {
  errorMessage,
  isPlainEnter,
  ledgerInputStyle,
  money,
  OCR_ACCEPT,
  toLedgerEntryInput,
} from './ledgerMeta'

const NO_MATCH_HINT =
  '没有识别到金额。可以写成「午饭 25，瑞幸 16.9，昨天打车 38 微信」，用逗号分隔每一笔。'

/** One line of text (or a pasted screenshot) -> offline parse -> preview -> one-click save. */
export function QuickLedgerCapture({
  masked,
  onFlightChange,
  onSaved,
}: {
  masked: boolean
  /** Reports in-flight work so the shell can lock its mode switch and close button. */
  onFlightChange: (state: { busy: boolean; saving: boolean }) => void
  onSaved: (res: LedgerCreateResult) => void
}) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<LedgerPreviewItem[]>([])
  /** Text the preview was parsed from; OCR results only append, so it stays the source of truth. */
  const [parsedText, setParsedText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState<{ done: number; total: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const busy = parsing || saving || ocrProgress !== null
  const total = Math.round(preview.reduce((sum, item) => sum + item.amount, 0) * 100) / 100
  // Enter confirms only while the text still matches what was parsed; any edit parses again.
  const previewIsCurrent = preview.length > 0 && text.trim() === parsedText

  useEffect(() => {
    onFlightChange({ busy, saving })
  }, [busy, saving, onFlightChange])

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
      setParsedText(value)
    } catch (e) {
      setErr(errorMessage(e, '解析失败，请稍后再试'))
    } finally {
      setParsing(false)
    }
  }

  /** Screenshots go through the serial server OCR queue; sanitized results are appended to the preview. */
  async function handleImages(files: File[]) {
    if (files.length === 0 || ocrProgress) return
    setErr('')
    setOcrProgress({ done: 0, total: files.length })
    const { found, failed } = await recognizeImages(files, (done, total) => setOcrProgress({ done, total }))
    setOcrProgress(null)
    if (found.length > 0) setPreview((cur) => [...cur, ...found])
    if (failed.length > 0) setErr(failed.join('；'))
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const files: File[] = []
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length === 0) return
    e.preventDefault()
    handleImages(files)
  }

  async function handleConfirm() {
    if (preview.length === 0 || busy) return
    setSaving(true)
    setErr('')
    try {
      const res = await api.createLedgerEntries(preview.map(toLedgerEntryInput))
      emitLedgerUpdated()
      onSaved(res)
    } catch (e) {
      setErr(errorMessage(e, '保存失败，请稍后再试'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        data-testid="quick-ledger-input"
        autoFocus
        value={text}
        maxLength={2000}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (!isPlainEnter(e)) return
          e.preventDefault()
          if (previewIsCurrent) handleConfirm()
          else handleQuick()
        }}
        placeholder="午饭 25，瑞幸 16.9，昨天打车 38 微信"
        className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none disabled:opacity-60"
        style={ledgerInputStyle}
      />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="quick-ledger-ocr-btn"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          title="在上方输入框按 Ctrl+V 可直接粘贴截图；点击这里选择图片文件"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium sidebar-row pressable cursor-pointer disabled:opacity-50"
          style={ledgerPillButtonStyle}
        >
          {ocrProgress ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          <span>粘贴或上传截图（离线 OCR）</span>
        </button>
        <button
          type="button"
          data-testid="quick-ledger-parse"
          disabled={busy || !text.trim()}
          onClick={handleQuick}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
          style={ledgerAccentButtonStyle}
        >
          {parsing && <Loader2 size={13} className="animate-spin" />}
          <span>解析</span>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={OCR_ACCEPT}
        multiple
        hidden
        data-testid="quick-ledger-ocr-file"
        onChange={(e) => {
          handleImages(Array.from(e.target.files || []))
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
              合计 <span className="font-medium tabular-nums">{money(total, masked)}</span>
              {previewIsCurrent && ' · 按 Enter 直接记入'}
            </span>
            <button
              type="button"
              data-testid="quick-ledger-confirm"
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
      )}
    </div>
  )
}
