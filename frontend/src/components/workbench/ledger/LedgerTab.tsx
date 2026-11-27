import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  type LedgerCreateResult,
  type LedgerEntry,
  type LedgerOverview,
  type LedgerSettings,
} from '../../../api/client'
import { LedgerEntryList } from './LedgerEntryList'
import { LedgerEntryModal } from './LedgerEntryModal'
import { LedgerHeader } from './LedgerHeader'
import { LedgerImportModal } from './LedgerImportModal'
import { LedgerPrivacyModal } from './LedgerPrivacyModal'
import { LedgerQuickBar } from './LedgerQuickBar'
import { LedgerSummaryCards } from './LedgerSummaryCards'
import { LedgerNotice } from './LedgerUi'
import { errorMessage, shiftMonth, todayMonth } from './ledgerMeta'

const DEFAULT_SETTINGS: LedgerSettings = { monthly_budget: 0, strict_offline: true }
const CONFIRM_WINDOW_MS = 6000

function maskKey(userId: string): string {
  return `donut_ledger_masked_${userId}`
}

function readMasked(userId: string): boolean {
  try {
    return localStorage.getItem(maskKey(userId)) === '1'
  } catch {
    return false
  }
}

/** Shell of the 随手记账 plugin: owns the overview state, privacy mask, month and all modals. */
export function LedgerTab({ userId, onToast }: { userId: string; onToast?: (msg: string) => void }) {
  const [data, setData] = useState<LedgerOverview | null>(null)
  // '' lets the server pick the most recent month that actually has entries.
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [masked, setMasked] = useState(() => readMasked(userId))
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ open: boolean; entry: LedgerEntry | null }>({ open: false, entry: null })
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const toast = (msg: string) => onToast?.(msg)

  const load = useCallback(async (target: string) => {
    setLoading(true)
    setErr('')
    try {
      setData(await api.getLedger(target || undefined))
    } catch (e) {
      setErr(errorMessage(e, '加载账本失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(month)
  }, [load, month])

  useEffect(() => {
    if (!confirmingId) return
    const timer = setTimeout(() => setConfirmingId(null), CONFIRM_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [confirmingId])

  const shownMonth = data?.month ?? month
  const monthOptions = useMemo(
    () =>
      Array.from(new Set([shownMonth, todayMonth(), ...(data?.available_months || [])]))
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a)),
    [shownMonth, data],
  )

  function toggleMasked() {
    const next = !masked
    setMasked(next)
    try {
      localStorage.setItem(maskKey(userId), next ? '1' : '0')
    } catch {
      // private mode / storage disabled: the mask still works for this session
    }
  }

  /** After quick / OCR / manual entry: jump to the month of the first saved row if it differs. */
  function handleCreated(res: LedgerCreateResult) {
    const first = res.inserted[0]
    if (first && first.month !== shownMonth) setMonth(first.month)
    else load(month)
    if (res.inserted.length > 0) toast(`已记入 ${res.inserted.length} 笔`)
  }

  async function handleDelete(entry: LedgerEntry) {
    setBusyId(entry.id)
    try {
      await api.deleteLedgerEntry(entry.id)
      setConfirmingId(null)
      toast('已删除这一笔')
      await load(month)
    } catch (e) {
      setErr(errorMessage(e, '删除失败'))
    } finally {
      setBusyId(null)
    }
  }

  function closeEditor() {
    setEditor({ open: false, entry: null })
  }

  return (
    <div data-testid="ledger-tab" className="space-y-4 animate-msg-in">
      <LedgerHeader
        shownMonth={shownMonth}
        monthOptions={monthOptions}
        loading={loading}
        strictOffline={Boolean(data?.settings.strict_offline)}
        masked={masked}
        onMonth={setMonth}
        onStep={(delta) => data && setMonth(shiftMonth(data.month, delta))}
        onToggleMask={toggleMasked}
        onOpenPrivacy={() => setPrivacyOpen(true)}
      />

      {err && <LedgerNotice tone="danger">{err}</LedgerNotice>}

      {data && <LedgerSummaryCards data={data} masked={masked} onOpenSettings={() => setPrivacyOpen(true)} />}

      <LedgerQuickBar
        masked={masked}
        onCreated={handleCreated}
        onOpenImport={() => setImportOpen(true)}
        onToast={toast}
      />

      <LedgerEntryList
        entries={data?.entries || []}
        masked={masked}
        loading={loading}
        busyId={busyId}
        confirmingId={confirmingId}
        category={category}
        search={search}
        onCategory={setCategory}
        onSearch={setSearch}
        onAdd={() => setEditor({ open: true, entry: null })}
        onEdit={(entry) => setEditor({ open: true, entry })}
        onRequestDelete={(entry) => setConfirmingId(entry.id)}
        onDelete={handleDelete}
        onCancelDelete={() => setConfirmingId(null)}
      />

      {editor.open && (
        <LedgerEntryModal
          editing={editor.entry}
          onClose={closeEditor}
          onSaved={(msg) => {
            closeEditor()
            toast(msg)
            load(month)
          }}
        />
      )}

      {importOpen && (
        <LedgerImportModal
          masked={masked}
          onClose={() => setImportOpen(false)}
          onImported={() => load(month)}
        />
      )}

      {privacyOpen && (
        <LedgerPrivacyModal
          settings={data?.settings || DEFAULT_SETTINGS}
          month={shownMonth}
          onClose={() => setPrivacyOpen(false)}
          onSettingsChange={(settings) => {
            setData((cur) => (cur ? { ...cur, settings } : cur))
            toast('账本设置已保存')
            load(month)
          }}
          onWiped={(removed) => {
            setPrivacyOpen(false)
            toast(`已清空 ${removed} 笔账目`)
            setMonth('')
            load('')
          }}
        />
      )}
    </div>
  )
}
