import { useEffect, useState, type FormEvent } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { api, type LedgerCreateResult } from '../../../api/client'
import { emitLedgerUpdated } from '../../../utils/portalRoute'
import { LedgerChip, LedgerField, ledgerAccentButtonStyle } from './LedgerPrimitives'
import { LedgerNotice } from './LedgerUi'
import {
  errorMessage,
  guardImeEnter,
  LEDGER_CATEGORIES,
  LEDGER_PAYMENT_METHODS,
  ledgerInputStyle,
  todayIso,
} from './ledgerMeta'

const NO_METHOD = ''
const INPUT_CLASS = 'w-full px-3 py-2 rounded-xl text-sm outline-none'

/** Compact single-entry form for when the amount should be typed exactly. */
export function QuickLedgerManualForm({
  onFlightChange,
  onSaved,
}: {
  /** Reports in-flight work so the shell can lock its mode switch and close button. */
  onFlightChange: (state: { busy: boolean; saving: boolean }) => void
  onSaved: (res: LedgerCreateResult) => void
}) {
  const [date, setDate] = useState(todayIso)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('餐饮')
  const [merchant, setMerchant] = useState('')
  const [method, setMethod] = useState(NO_METHOD)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    onFlightChange({ busy: saving, saving })
  }, [saving, onFlightChange])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount.trim())
    if (!date) return setErr('请选择日期')
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setErr('请输入大于 0 的金额')
    if (value > 99999999) return setErr('金额过大，请检查是否多输入了位数')
    setSaving(true)
    setErr('')
    const payload = {
      occurred_date: date,
      amount: Math.round(value * 100) / 100,
      category,
      merchant: merchant.trim(),
      payment_method: method,
      note: note.trim(),
    }
    try {
      const res = await api.createLedgerEntries([{ ...payload, source: 'manual', fingerprint: '' }])
      emitLedgerUpdated()
      onSaved(res)
    } catch (e2) {
      setErr(errorMessage(e2, '保存失败，请稍后再试'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="quick-ledger-manual-form">
      {err && <LedgerNotice tone="danger">{err}</LedgerNotice>}

      <div className="flex items-end gap-2.5">
        <LedgerField label="日期">
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${INPUT_CLASS} w-auto`}
            style={ledgerInputStyle}
          />
        </LedgerField>
        <div className="flex-1">
          <LedgerField label="金额">
            <input
              data-testid="quick-ledger-manual-amount"
              autoFocus
              type="text"
              inputMode="decimal"
              value={amount}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={guardImeEnter}
              className="w-full px-3.5 py-1.5 rounded-xl text-[22px] font-semibold tabular-nums outline-none"
              style={ledgerInputStyle}
            />
          </LedgerField>
        </div>
      </div>

      <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span>分类</span>
        <div className="flex flex-wrap gap-1.5">
          {LEDGER_CATEGORIES.map((name) => (
            <LedgerChip key={name} active={category === name} onClick={() => setCategory(name)}>
              {name}
            </LedgerChip>
          ))}
        </div>
      </div>

      <LedgerField label="商户">
        <input
          type="text"
          maxLength={40}
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          onKeyDown={guardImeEnter}
          placeholder="例如：瑞幸咖啡"
          className={INPUT_CLASS}
          style={ledgerInputStyle}
        />
      </LedgerField>

      <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span>支付方式</span>
        <div className="flex flex-wrap gap-1.5">
          <LedgerChip active={method === NO_METHOD} onClick={() => setMethod(NO_METHOD)}>
            不填
          </LedgerChip>
          {LEDGER_PAYMENT_METHODS.map((name) => (
            <LedgerChip key={name} active={method === name} onClick={() => setMethod(name)}>
              {name}
            </LedgerChip>
          ))}
        </div>
      </div>

      <LedgerField label="备注（可选）">
        <input
          type="text"
          maxLength={120}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={guardImeEnter}
          placeholder="和谁、为什么花的"
          className={INPUT_CLASS}
          style={ledgerInputStyle}
        />
      </LedgerField>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          data-testid="quick-ledger-manual-save"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
          style={ledgerAccentButtonStyle}
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          <Check size={13} />
          <span>记入账本</span>
        </button>
      </div>
    </form>
  )
}
