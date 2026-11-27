import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { api } from '../../../api/client'
import { LedgerNotice } from './LedgerUi'
import { errorMessage, isPlainEnter, ledgerInputStyle } from './ledgerMeta'

/**
 * Danger zone with a two-step confirmation: (1) press 清空 to arm, (2) type WIPE and confirm.
 * The server independently requires the same `confirm: "WIPE"` token.
 */
export function LedgerWipeSection({ onWiped }: { onWiped: (removed: number) => void }) {
  const [armed, setArmed] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ready = typed.trim().toUpperCase() === 'WIPE'

  function disarm() {
    setArmed(false)
    setTyped('')
    setErr('')
  }

  async function handleWipe() {
    if (!ready || busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await api.wipeLedger()
      onWiped(res.removed)
    } catch (e) {
      setErr(errorMessage(e, '清空失败，请稍后再试'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="ledger-wipe-section"
      className="rounded-2xl p-3.5 space-y-2.5"
      style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.24)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium" style={{ color: 'var(--danger)' }}>清空全部账本数据</div>
          <div className="text-[11.5px] leading-relaxed mt-0.5" style={{ color: 'var(--text-muted)' }}>
            删除所有月份的账目并重置预算，无法撤销；另一个账号的账本不受影响。
          </div>
        </div>
        {!armed && (
          <button
            type="button"
            data-testid="ledger-wipe-arm"
            onClick={() => setArmed(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium pressable cursor-pointer shrink-0"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(220,38,38,0.3)', color: 'var(--danger)' }}
          >
            <Trash2 size={13} />
            <span>清空</span>
          </button>
        )}
      </div>

      {armed && (
        <div className="space-y-2 animate-msg-in">
          <input
            data-testid="ledger-wipe-confirm-input"
            value={typed}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (isPlainEnter(e)) handleWipe()
            }}
            placeholder="输入 WIPE 以确认"
            className="w-full px-3 py-2 rounded-xl text-sm outline-none disabled:opacity-60"
            style={ledgerInputStyle}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={disarm}
              className="px-3.5 py-2 rounded-xl text-xs font-medium sidebar-row cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
            >
              取消
            </button>
            <button
              type="button"
              data-testid="ledger-wipe-confirm"
              disabled={busy || !ready}
              onClick={handleWipe}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-40"
              style={{ background: 'var(--danger)', color: 'var(--bg-surface)' }}
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              <span>确认清空</span>
            </button>
          </div>
        </div>
      )}

      {err && <LedgerNotice tone="danger">{err}</LedgerNotice>}
    </div>
  )
}
