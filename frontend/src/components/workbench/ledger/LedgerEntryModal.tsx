import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { api, type LedgerEntry, type LedgerSource } from '../../../api/client'
import { LedgerChip, LedgerField } from './LedgerPrimitives'
import { LedgerModalFrame, LedgerNotice } from './LedgerUi'
import {
  errorMessage,
  guardImeEnter,
  LEDGER_CATEGORIES,
  LEDGER_PAYMENT_METHODS,
  ledgerInputStyle,
  todayIso,
} from './ledgerMeta'

const NO_METHOD = ''

/** Add or edit one entry. Edit sends every editable field; the server keeps id / source / fingerprint. */
export function LedgerEntryModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: LedgerEntry | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [date, setDate] = useState(editing?.occurred_date || todayIso())
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [category, setCategory] = useState(editing?.category || '餐饮')
  const [merchant, setMerchant] = useState(editing?.merchant || '')
  const [method, setMethod] = useState(editing?.payment_method || NO_METHOD)
  const [note, setNote] = useState(editing?.note || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount.trim())
    if (!date) return setErr('请选择日期')
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) return setErr('请输入大于 0 的金额')
    if (value > 99999999) return setErr('金额过大，请检查是否多输入了位数')
    setSaving(true)
    setErr('')
    const payload = {
      occurred_date: date, amount: Math.round(value * 100) / 100, category,
      merchant: merchant.trim(), payment_method: method, note: note.trim(),
    }
    try {
      if (editing) {
        await api.updateLedgerEntry(editing.id, payload)
        onSaved(`已更新「${payload.merchant || '这一笔'}」`)
      } else {
        await api.createLedgerEntries([{ ...payload, source: 'manual' as LedgerSource, fingerprint: '' }])
        onSaved(`已记下「${payload.merchant || payload.category}」`)
      }
    } catch (e2) {
      setErr(errorMessage(e2, '保存失败，请稍后再试'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <LedgerModalFrame
      testId="ledger-entry-modal"
      title={editing ? '编辑账目' : '手动记一笔'}
      subtitle="只保存在你自己的账本里"
      busy={saving}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5" data-testid="ledger-entry-form">
        {err && <LedgerNotice tone="danger">{err}</LedgerNotice>}

        <div className="grid grid-cols-2 gap-2.5">
          <LedgerField label="日期">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={ledgerInputStyle}
            />
          </LedgerField>
          <LedgerField label="金额">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={guardImeEnter}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={ledgerInputStyle}
            />
          </LedgerField>
        </div>

        <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>分类</span>
          <div className="flex flex-wrap gap-1.5">
            {LEDGER_CATEGORIES.map((name) => (
              <LedgerChip key={name} active={category === name} onClick={() => setCategory(name)}>{name}</LedgerChip>
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
            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
            style={ledgerInputStyle}
          />
        </LedgerField>

        <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>支付方式</span>
          <div className="flex flex-wrap gap-1.5">
            <LedgerChip active={method === NO_METHOD} onClick={() => setMethod(NO_METHOD)}>不填</LedgerChip>
            {LEDGER_PAYMENT_METHODS.map((name) => (
              <LedgerChip key={name} active={method === name} onClick={() => setMethod(name)}>{name}</LedgerChip>
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
            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
            style={ledgerInputStyle}
          />
        </LedgerField>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium sidebar-row cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            data-testid="ledger-entry-save"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            <span>保存</span>
          </button>
        </div>
      </form>
    </LedgerModalFrame>
  )
}
