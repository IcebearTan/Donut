import { useEffect, useState } from 'react'
import { Loader2, Sparkles, X } from 'lucide-react'

const DISMISS_STORAGE_PREFIX = 'portal_compact_dismiss_v1:'
export const COMPACT_HINT_TURNS = 20

interface Props {
  sessionKey: string
  contextGen: number
  turnsSinceCompact: number
  streaming: boolean
  compacting: boolean
  onCompact: () => Promise<void> | void
}

function isDismissedInStorage(storageKey: string): boolean {
  try {
    return sessionStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}

export function CompactContextPill({
  sessionKey,
  contextGen,
  turnsSinceCompact,
  streaming,
  compacting,
  onCompact,
}: Props) {
  const storageKey = `${DISMISS_STORAGE_PREFIX}${sessionKey}:g${contextGen}`
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissedInStorage(storageKey))
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setDismissed(isDismissedInStorage(storageKey))
    setConfirming(false)
  }, [storageKey])

  if (dismissed || streaming || turnsSinceCompact < COMPACT_HINT_TURNS) {
    return null
  }

  function handleDismiss() {
    setDismissed(true)
    setConfirming(false)
    try {
      sessionStorage.setItem(storageKey, '1')
    } catch {
      // ignore storage quota errors
    }
  }

  async function handleConfirm() {
    setConfirming(false)
    await onCompact()
  }

  return (
    <div className="px-3 sm:px-6 pb-2 flex justify-center animate-msg-in">
      <div
        data-testid="compact-context-pill"
        className="inline-flex flex-wrap items-center justify-center gap-2 pl-3.5 pr-2 py-1.5 rounded-full text-xs max-w-full"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
          color: 'var(--text-secondary)',
        }}
      >
        {compacting ? (
          <>
            <Loader2 size={13} className="animate-spin shrink-0" style={{ color: 'var(--accent)' }} />
            <span className="pr-1.5">正在沉淀重点至长期记忆并轻装翻篇…</span>
          </>
        ) : confirming ? (
          <>
            <Sparkles size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
            <span>历史聊天记录完整保留，确认提炼记忆并翻篇？</span>
            <button
              type="button"
              data-testid="confirm-compact-context-btn"
              onClick={handleConfirm}
              className="px-2.5 py-0.5 rounded-full text-[11.5px] font-medium pressable cursor-pointer"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              确认整理
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-2 py-0.5 rounded-full text-[11.5px] sidebar-row cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              取消
            </button>
          </>
        ) : (
          <>
            <Sparkles size={13} className="shrink-0" style={{ color: 'var(--accent)' }} />
            <span>
              本段已聊 <strong className="font-medium" style={{ color: 'var(--text-primary)' }}>{turnsSinceCompact}</strong> 轮，沉淀记忆并轻装继续？
            </span>
            <button
              type="button"
              data-testid="open-compact-context-btn"
              onClick={() => setConfirming(true)}
              className="px-2.5 py-0.5 rounded-full text-[11.5px] font-medium pressable cursor-pointer"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              整理瘦身
            </button>
            <button
              type="button"
              data-testid="dismiss-compact-context-btn"
              aria-label="关闭提醒"
              title="本次暂不提醒"
              onClick={handleDismiss}
              className="p-1 rounded-full sidebar-row cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
