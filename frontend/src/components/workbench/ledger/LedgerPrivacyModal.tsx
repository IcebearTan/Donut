import { useState } from 'react'
import type { FormEvent } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { api, type LedgerSettings } from '../../../api/client'
import { LedgerPillButton, ledgerAccentButtonStyle } from './LedgerPrimitives'
import { LedgerTrustCard } from './LedgerTrustCard'
import { LedgerModalFrame, LedgerNotice } from './LedgerUi'
import { LedgerWipeSection } from './LedgerWipeSection'
import { downloadBlob, errorMessage, guardImeEnter, ledgerInputStyle, monthLabel } from './ledgerMeta'

/** Budget, strict-offline switch, data-flow trust card, CSV export and the wipe danger zone. */
export function LedgerPrivacyModal({
  settings,
  month,
  onClose,
  onSettingsChange,
  onWiped,
}: {
  settings: LedgerSettings
  month: string
  onClose: () => void
  /** Settings changed; the parent refreshes its overview but keeps this modal open. */
  onSettingsChange: (settings: LedgerSettings) => void
  onWiped: (removed: number) => void
}) {
  const [budget, setBudget] = useState(settings.monthly_budget > 0 ? String(settings.monthly_budget) : '')
  const [strictOffline, setStrictOffline] = useState(settings.strict_offline)
  const [savingBudget, setSavingBudget] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [err, setErr] = useState('')
  const busy = savingBudget || toggling || exporting

  async function saveBudget(e: FormEvent) {
    e.preventDefault()
    const value = budget.trim() === '' ? 0 : Number(budget.trim())
    if (!Number.isFinite(value) || value < 0) return setErr('预算需为 0 或正数')
    if (value > 99999999) return setErr('预算金额过大，请检查是否多输入了位数')
    setSavingBudget(true)
    setErr('')
    try {
      const res = await api.updateLedgerSettings({ monthly_budget: Math.round(value * 100) / 100 })
      onSettingsChange(res.settings)
      onClose()
    } catch (e2) {
      setErr(errorMessage(e2, '保存预算失败'))
    } finally {
      setSavingBudget(false)
    }
  }

  async function toggleStrict() {
    const next = !strictOffline
    setStrictOffline(next)
    setToggling(true)
    setErr('')
    try {
      const res = await api.updateLedgerSettings({ strict_offline: next })
      onSettingsChange(res.settings)
    } catch (e2) {
      setStrictOffline(!next)
      setErr(errorMessage(e2, '保存开关失败'))
    } finally {
      setToggling(false)
    }
  }

  async function handleExport(target?: string) {
    setExporting(true)
    setErr('')
    try {
      const blob = await api.exportLedgerCsv(target)
      downloadBlob(blob, `ledger_${(target || 'all').replace('-', '')}.csv`)
    } catch (e2) {
      setErr(errorMessage(e2, '导出失败'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <LedgerModalFrame
      testId="ledger-privacy-modal"
      title="隐私与设置"
      subtitle="预算、离线开关、导出与清空都在这里"
      busy={busy}
      onClose={onClose}
    >
      {err && <LedgerNotice tone="danger">{err}</LedgerNotice>}

      <form onSubmit={saveBudget} className="rounded-2xl p-3.5 space-y-2.5" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}>
        <div>
          <div className="text-xs font-medium">每月预算</div>
          <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>留空或填 0 表示不设预算；随时可以调整。</div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            onKeyDown={guardImeEnter}
            placeholder="例如 3000"
            className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm outline-none"
            style={{ ...ledgerInputStyle, background: 'var(--bg-surface)' }}
          />
          <button
            type="submit"
            disabled={busy}
            data-testid="ledger-budget-save"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
            style={ledgerAccentButtonStyle}
          >
            {savingBudget && <Loader2 size={13} className="animate-spin" />}
            <span>保存预算</span>
          </button>
        </div>
      </form>

      <div className="rounded-2xl p-3.5 flex items-start justify-between gap-3" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}>
        <div className="min-w-0">
          <div className="text-xs font-medium">严格离线模式（禁止外发 AI）</div>
          <div className="text-[11.5px] leading-relaxed mt-0.5" style={{ color: 'var(--text-muted)' }}>
            默认开启。目前速记解析、截图识别、账单导入本来就全部在服务器本地完成、不调用外部 AI；此开关保存在你的私有设置里，作为后续功能的底线约定。
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={strictOffline}
          aria-label="严格离线模式"
          data-testid="ledger-strict-offline"
          disabled={busy}
          onClick={toggleStrict}
          className="relative w-10 h-[22px] rounded-full shrink-0 cursor-pointer transition-colors pressable disabled:opacity-60"
          style={{ background: strictOffline ? 'var(--success)' : 'var(--border-strong)' }}
        >
          <span
            className="absolute top-[3px] w-4 h-4 rounded-full transition-all"
            style={{ left: strictOffline ? '21px' : '3px', background: 'var(--bg-surface)' }}
          />
        </button>
      </div>

      <LedgerTrustCard />

      <div className="rounded-2xl p-3.5 space-y-2.5" style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}>
        <div>
          <div className="text-xs font-medium">导出 CSV</div>
          <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            UTF-8 带 BOM，可直接用 Excel 打开；由服务器生成后在浏览器中下载。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <LedgerPillButton
            size="md"
            disabled={busy}
            onClick={() => handleExport(month)}
            icon={exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          >
            导出 {monthLabel(month)}
          </LedgerPillButton>
          <LedgerPillButton size="md" disabled={busy} onClick={() => handleExport()} icon={<Download size={13} />}>
            导出全部月份
          </LedgerPillButton>
        </div>
      </div>

      <LedgerWipeSection onWiped={onWiped} />
    </LedgerModalFrame>
  )
}
