import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { MAX_BILL_FILE_BYTES } from './ledgerMeta'

/** Drag-and-drop / click-to-pick target for one WeChat / Alipay bill file (nothing is read here). */
export function LedgerDropZone({
  busy,
  onFile,
}: {
  busy: boolean
  onFile: (file: File) => void
}) {
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function openPicker() {
    if (!busy) fileRef.current?.click()
  }

  function pick(files: FileList | null | undefined) {
    const file = files?.[0]
    if (file && !busy) onFile(file)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-testid="ledger-import-dropzone"
        aria-label="上传账单文件"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className="rounded-2xl px-4 py-8 flex flex-col items-center gap-2 text-center cursor-pointer transition-colors outline-none focus-visible:ring-2"
        style={{
          background: dragging ? 'var(--bg-hover)' : 'var(--bg-sidebar)',
          border: `1.5px dashed ${dragging ? 'var(--text-secondary)' : 'var(--border-strong)'}`,
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? (
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        ) : (
          <FileUp size={22} style={{ color: 'var(--text-muted)' }} />
        )}
        <div className="text-xs font-medium">{busy ? '正在离线解析账单…' : '拖拽账单文件到这里，或点击选择'}</div>
        <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
          支持 .csv / .xlsx，最大 {MAX_BILL_FILE_BYTES / 1024 / 1024}MB
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx"
        hidden
        data-testid="ledger-import-file"
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
    </>
  )
}
