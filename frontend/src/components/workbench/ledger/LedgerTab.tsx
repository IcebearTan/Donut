import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api,
  type LedgerCreateResult,
  type LedgerEntry,
  type LedgerOverview,
  type LedgerSettings,
} from '../../../api/client'
import { LEDGER_UPDATED_EVENT } from '../../../utils/portalRoute'
import { LedgerEntryList } from './LedgerEntryList'
import { LedgerEntryModal } from './LedgerEntryModal'
import { LedgerHeader } from './LedgerHeader'
import { LedgerImportModal } from './LedgerImportModal'
import { LedgerPrivacyModal } from './LedgerPrivacyModal'
import { LedgerQuickBar } from './LedgerQuickBar'
import { LedgerSummaryCards } from './LedgerSummaryCards'
import { LedgerNotice } from './LedgerUi'
import { errorMessage, shiftMonth, type LedgerSlideDir } from './ledgerMeta'

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

function slideBetween(previous: string | undefined, next: string): LedgerSlideDir {
  if (!previous || previous === next) return 'none'
  return next > previous ? 'right' : 'left'
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
  /** Bumped after every successful load so the figures, bars and rows replay their motion. */
  const [refreshTick, setRefreshTick] = useState(0)
  const [slideDir, setSlideDir] = useState<LedgerSlideDir>('none')
  const shownData = useRef<LedgerOverview | null>(null)
  const requestId = useRef(0)
  const monthRef = useRef(month)
  monthRef.current = month

  const toast = (msg: string) => onToast?.(msg)

  /**
   * Loads a month while the previous overview stays on screen. `animate` slides the cards in the
   * direction of travel (month switch); plain refreshes replay in place.
   */
  const load = useCallback(async (target: string, animate = false) => {
    const id = ++requestId.current
    setLoading(true)
    setErr('')
    try {
      const next = await api.getLedger(target || undefined)
      // A slower, older request must never overwrite a newer month.
      if (id !== requestId.current) return
      setSlideDir(animate ? slideBetween(shownData.current?.month, next.month) : 'none')
      shownData.current = next
      setData(next)
      setRefreshTick((tick) => tick + 1)
    } catch (e) {
      if (id === requestId.current) setErr(errorMessage(e, '加载账本失败'))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(month, true)
  }, [load, month])

  // Entries added from the global quick-ledger modal (or another view) refresh the open month.
  useEffect(() => {
    const onUpdated = () => load(monthRef.current)
    window.addEventListener(LEDGER_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(LEDGER_UPDATED_EVENT, onUpdated)
  }, [load])

  useEffect(() => {
    if (!confirmingId) return
    const timer = setTimeout(() => setConfirmingId(null), CONFIRM_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [confirmingId])

  // The switcher answers immediately; the cards below still show the previous month while loading.
  const shownMonth = month || data?.month || ''
  const availableMonths = data?.available_months || []
  const openEditor = (entry: LedgerEntry | null) => setEditor({ open: true, entry })

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
        availableMonths={availableMonths}
        loading={loading}
        strictOffline={Boolean(data?.settings.strict_offline)}
        masked={masked}
        onMonth={setMonth}
        onStep={(delta) => shownMonth && setMonth(shiftMonth(shownMonth, delta))}
        onRefresh={() => load(month)}
        onToggleMask={toggleMasked}
        onOpenPrivacy={() => setPrivacyOpen(true)}
        onAdd={() => openEditor(null)}
      />

      {err && <LedgerNotice tone="danger">{err}</LedgerNotice>}

      <LedgerQuickBar
        masked={masked}
        onCreated={handleCreated}
        onOpenImport={() => setImportOpen(true)}
        onToast={toast}
      />

      {data && (
        <LedgerSummaryCards
          data={data}
          masked={masked}
          loading={loading}
          refreshTick={refreshTick}
          slideDir={slideDir}
          onOpenSettings={() => setPrivacyOpen(true)}
        />
      )}

      <LedgerEntryList
        entries={data?.entries || []}
        masked={masked}
        loading={loading}
        busyId={busyId}
        confirmingId={confirmingId}
        category={category}
        search={search}
        monthKey={data?.month || ''}
        refreshTick={refreshTick}
        slideDir={slideDir}
        onCategory={setCategory}
        onSearch={setSearch}
        onAdd={() => openEditor(null)}
        onEdit={openEditor}
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
