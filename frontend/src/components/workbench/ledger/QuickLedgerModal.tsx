import { useState } from 'react'
import { ArrowRight, PenLine, Type } from 'lucide-react'
import type { LedgerCreateResult } from '../../../api/client'
import { LedgerModalFrame } from './LedgerUi'
import { QuickLedgerCapture } from './QuickLedgerCapture'
import { QuickLedgerManualForm } from './QuickLedgerManualForm'
import { todayMonth } from './ledgerMeta'

type QuickLedgerMode = 'quick' | 'manual'

const MODES: Array<{ id: QuickLedgerMode; label: string; icon: typeof Type }> = [
  { id: 'quick', label: '一句话速记', icon: Type },
  { id: 'manual', label: '手动精记', icon: PenLine },
]

interface FlightState {
  busy: boolean
  saving: boolean
}

const IDLE: FlightState = { busy: false, saving: false }

function readMasked(userId: string): boolean {
  try {
    return localStorage.getItem(`donut_ledger_masked_${userId}`) === '1'
  } catch {
    return false
  }
}

/**
 * Global 0-token quick capture, reachable from any page (Alt+L / composer Wallet button).
 * The parent owns closing: both `onSaved` and `onOpenLedgerPage` end the flow.
 */
export function QuickLedgerModal({
  userId,
  onClose,
  onSaved,
  onOpenLedgerPage,
}: {
  userId: string
  onClose: () => void
  onSaved: (count: number, firstMonth: string) => void
  onOpenLedgerPage: () => void
}) {
  const [mode, setMode] = useState<QuickLedgerMode>('quick')
  const [flight, setFlight] = useState<FlightState>(IDLE)
  const [masked] = useState(() => readMasked(userId))

  const panelProps = {
    onFlightChange: setFlight,
    onSaved: (res: LedgerCreateResult) =>
      onSaved(res.inserted.length, res.inserted[0]?.month || todayMonth()),
  }

  return (
    <LedgerModalFrame
      testId="quick-ledger-modal"
      title="随手记一笔"
      subtitle="离线解析 · 0 Token · 原图不落盘"
      busy={flight.saving}
      onClose={onClose}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <div
          role="group"
          aria-label="记账方式"
          className="inline-flex items-center gap-0.5 p-1 rounded-2xl"
          style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
        >
          {MODES.map(({ id, label, icon: Icon }) => {
            const active = mode === id
            return (
              <button
                key={id}
                type="button"
                data-testid={`quick-ledger-mode-${id}`}
                aria-pressed={active}
                disabled={flight.busy}
                onClick={() => setMode(id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
                style={{
                  background: active ? 'var(--bg-surface)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                }}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          data-testid="quick-ledger-open-page"
          disabled={flight.busy}
          onClick={onOpenLedgerPage}
          className="inline-flex items-center gap-1 text-xs font-medium sidebar-row pressable cursor-pointer disabled:opacity-50"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>打开完整账本</span>
          <ArrowRight size={12} />
        </button>
      </div>

      {mode === 'quick' ? (
        <QuickLedgerCapture masked={masked} {...panelProps} />
      ) : (
        <QuickLedgerManualForm {...panelProps} />
      )}
    </LedgerModalFrame>
  )
}
