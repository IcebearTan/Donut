import type { ReactNode } from 'react'
import { ShieldCheck, X } from 'lucide-react'

/** Shared backdrop + card shell for every Ledger modal so they stay visually identical. */
export function LedgerModalFrame({
  testId,
  title,
  subtitle,
  busy = false,
  onClose,
  children,
}: {
  testId: string
  title: string
  subtitle?: string
  busy?: boolean
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      data-testid={testId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
      onClick={() => !busy && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-3xl p-5 sm:p-6 space-y-4 animate-modal-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold tracking-tight">{title}</h3>
            {subtitle && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="关闭"
            disabled={busy}
            onClick={onClose}
            className="p-1.5 rounded-xl sidebar-row pressable cursor-pointer disabled:opacity-40"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  )
}

const NOTICE_TONES = {
  danger: {
    background: 'rgba(220,38,38,0.08)',
    color: 'var(--danger)',
    border: '1px solid rgba(220,38,38,0.2)',
  },
  success: {
    background: 'rgba(22,163,74,0.10)',
    color: 'var(--success)',
    border: '1px solid rgba(22,163,74,0.22)',
  },
  info: {
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  },
}

/** Inline status line (error / success / neutral hint) using the same tokens app-wide. */
export function LedgerNotice({
  tone,
  children,
}: {
  tone: keyof typeof NOTICE_TONES
  children: ReactNode
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className="px-3 py-2 rounded-xl text-xs leading-relaxed" style={NOTICE_TONES[tone]}>
      {children}
    </div>
  )
}

/** Green privacy guarantee strip shown wherever files are handed to the server. */
export function LedgerGuaranteeBanner({ lines }: { lines: string[] }) {
  return (
    <div
      className="px-3 py-2.5 rounded-2xl flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]"
      style={{
        background: 'rgba(22,163,74,0.10)',
        color: 'var(--success)',
        border: '1px solid rgba(22,163,74,0.22)',
      }}
    >
      <ShieldCheck size={14} className="shrink-0" />
      {lines.map((line, index) => (
        <span key={line} className="inline-flex items-center gap-2">
          {index > 0 && <span aria-hidden="true">·</span>}
          {line}
        </span>
      ))}
    </div>
  )
}

/** Small pill-shaped tag (category, payment method, import source). */
export function LedgerTag({ children }: { children: ReactNode }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 whitespace-nowrap"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
    >
      {children}
    </span>
  )
}
