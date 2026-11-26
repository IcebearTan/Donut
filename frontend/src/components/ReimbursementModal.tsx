import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import {
  api,
  type ReimbursementItem,
  type ReimbursementListResponse,
} from '../api/client'

interface Props {
  editing: ReimbursementItem | null
  facets: ReimbursementListResponse['facets']
  onClose: () => void
  onSaved: (msg: string) => void
}

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ReimbursementModal({ editing, facets, onClose, onSaved }: Props) {
  const [spendDate, setSpendDate] = useState(editing?.spend_date || todayIso())
  const [title, setTitle] = useState(editing?.title || '')
  const [platform, setPlatform] = useState(editing?.platform || '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [hasInvoice, setHasInvoice] = useState(editing?.has_invoice || '有')
  const [hasOrder, setHasOrder] = useState(editing?.has_order || '有')
  const [hasPayment, setHasPayment] = useState(editing?.has_payment || '有')
  const [materialStatus, setMaterialStatus] = useState(editing?.material_status || '齐全')
  const [claimStatus, setClaimStatus] = useState(editing?.claim_status || '已整理-未报销')
  const [note, setNote] = useState(editing?.note || '')
  const [attachmentPath, setAttachmentPath] = useState(editing?.attachment_path || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const inputStyle = {
    background: 'var(--bg-sidebar)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setErr('请填写报销项目名称')
      return
    }
    setSaving(true)
    setErr('')
    const numAmt = Number.parseFloat(amount || '0')
    const payload = {
      spend_date: spendDate.trim(),
      title: title.trim(),
      platform: platform.trim(),
      amount: Number.isFinite(numAmt) ? numAmt : 0,
      has_invoice: hasInvoice,
      has_order: hasOrder,
      has_payment: hasPayment,
      material_status: materialStatus,
      claim_status: claimStatus,
      note: note.trim(),
      attachment_path: attachmentPath.trim(),
    }
    try {
      if (editing) {
        await api.updateReimbursement(editing.row_index, {
          expected_fingerprint: editing.fingerprint,
          ...payload,
        })
        onSaved(`已更新「${payload.title}」`)
      } else {
        await api.createReimbursement(payload)
        onSaved(`已新增「${payload.title}」`)
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-testid="reimbursement-editor-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
      onClick={() => !saving && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-5 sm:p-6 space-y-4 animate-modal-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[16px] font-semibold">
            {editing ? '编辑报销记录' : '新增报销记录'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl sidebar-row cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {err && (
          <div
            className="px-3.5 py-2 rounded-xl text-xs"
            style={{
              background: 'rgba(239,68,68,0.08)',
              color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            {err}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>项目名称 *</span>
            <input
              data-testid="reimb-input-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：淘宝 12V 锂电池"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={inputStyle}
            />
          </label>
          <label className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>消费日期</span>
            <input
              type="date"
              data-testid="reimb-input-date"
              value={spendDate}
              onChange={(e) => setSpendDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={inputStyle}
            />
          </label>
          <label className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>金额（元）</span>
            <input
              type="number"
              step="0.01"
              data-testid="reimb-input-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none tabular-nums"
              style={inputStyle}
            />
          </label>
          <label className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>消费平台</span>
            <input
              data-testid="reimb-input-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="淘宝 / 京东 / 智谱 / 嘉立创"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={inputStyle}
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: '发票', val: hasInvoice, set: setHasInvoice },
            { label: '订单', val: hasOrder, set: setHasOrder },
            { label: '支付记录', val: hasPayment, set: setHasPayment },
          ].map((f) => (
            <label key={f.label} className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>{f.label}</span>
              <select
                value={f.val}
                onChange={(e) => f.set(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl text-xs outline-none"
                style={inputStyle}
              >
                {facets.doc_checks.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>材料状态</span>
            <select
              value={materialStatus}
              onChange={(e) => setMaterialStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs outline-none"
              style={inputStyle}
            >
              {facets.material_statuses.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>报单状态</span>
            <select
              data-testid="reimb-select-status"
              value={claimStatus}
              onChange={(e) => setClaimStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs outline-none"
              style={inputStyle}
            >
              {facets.claim_statuses.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>备注说明</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：11-26 交王哥 / 发票待重开"
            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
            style={inputStyle}
          />
        </label>

        <label className="block space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span>指定文件仓附件路径（可选，留空自动按日期与关键词匹配）</span>
          <input
            value={attachmentPath}
            onChange={(e) => setAttachmentPath(e.target.value)}
            placeholder="例如：报销/2026-11/20261103淘宝12V锂电池"
            className="w-full px-3 py-2 rounded-xl text-xs outline-none font-mono"
            style={inputStyle}
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium sidebar-row cursor-pointer"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            data-testid="reimb-save-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            <span>{editing ? '保存修改' : '添加记录'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
