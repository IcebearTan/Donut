import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, type FocusItem, type FocusState, type FocusUrgency } from '../../api/client'
import { FocusHeaderCard } from './FocusHeaderCard'
import { FocusItemModal } from './FocusItemModal'
import { FocusLinksModal } from './FocusLinksModal'
import { FocusQuickAddBar } from './FocusQuickAddBar'
import { FocusRow } from './FocusRow'

interface Props {
  onToast?: (msg: string) => void
}

export function FocusTab({ onToast }: Props) {
  const [data, setData] = useState<FocusState | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<FocusItem | null>(null)
  const [linksModalOpen, setLinksModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      setData(await api.getFocus())
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载今日焦点失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleToggleDone(item: FocusItem) {
    setBusyId(item.id)
    try {
      const res = await api.updateFocusItem(item.id, { done: !item.done })
      setData(res.focus)
      onToast?.(!item.done ? `已完成「${item.title}」` : `已恢复「${item.title}」`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '更新状态失败')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(item: FocusItem) {
    setBusyId(item.id)
    try {
      const res = await api.deleteFocusItem(item.id)
      setData(res.focus)
      onToast?.(`已删除「${item.title}」`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '删除失败')
    } finally {
      setBusyId(null)
    }
  }

  async function handleClearDone() {
    setLoading(true)
    try {
      const res = await api.clearDoneFocus()
      setData(res.focus)
      onToast?.('已清理已完成事项')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '清理失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleQuickAdd(payload: { title: string; urgency: FocusUrgency; tag: string }) {
    setErr('')
    try {
      const res = await api.addFocusItem(payload)
      setData(res.focus)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '添加失败')
      throw e
    }
  }

  const items = data?.items || []
  const activeItems = items.filter((x) => !x.done)
  const doneItems = items.filter((x) => x.done)
  const summary = data?.summary || { total: 0, done: 0, remaining: 0, must: 0, soon: 0, plan: 0 }
  const hasVisibleRows = activeItems.length > 0 || (showDone && doneItems.length > 0)

  return (
    <div data-testid="focus-tab" className="space-y-4 animate-msg-in">
      <FocusHeaderCard
        summary={summary}
        externalLinks={data?.external_links || []}
        doneCount={doneItems.length}
        showDone={showDone}
        loading={loading}
        onToggleShowDone={() => setShowDone((v) => !v)}
        onOpenLinks={() => setLinksModalOpen(true)}
        onRefresh={load}
        onNewDetail={() => {
          setEditingItem(null)
          setEditorOpen(true)
        }}
      />

      {err && (
        <div
          className="px-4 py-2.5 rounded-2xl text-xs"
          style={{
            background: 'rgba(220,38,38,0.08)',
            color: 'var(--danger)',
            border: '1px solid rgba(220,38,38,0.2)',
          }}
        >
          {err}
        </div>
      )}

      <div
        data-testid="focus-list-card"
        className="rounded-3xl overflow-hidden"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        {loading && !data ? (
          <div className="py-12 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={15} className="animate-spin" />
            <span>正在加载今日焦点…</span>
          </div>
        ) : !hasVisibleRows ? (
          <div className="py-12 px-4 text-center space-y-1.5">
            <div className="text-sm font-medium">
              {doneItems.length > 0 ? '今天的焦点事项已全部完成' : '暂无今日焦点事项'}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              在下方输入一行快速添加，或在对话里让 Donut 帮你同步今日焦点
            </div>
          </div>
        ) : (
          <div>
            {activeItems.map((it) => (
              <FocusRow
                key={it.id}
                item={it}
                busy={busyId === it.id}
                onToggleDone={handleToggleDone}
                onEdit={(item) => {
                  setEditingItem(item)
                  setEditorOpen(true)
                }}
                onDelete={handleDelete}
              />
            ))}

            {showDone && doneItems.length > 0 && (
              <div>
                <div
                  className="px-4 py-2 flex items-center justify-between text-xs"
                  style={{
                    background: 'var(--bg-sidebar)',
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>已完成（{doneItems.length}）</span>
                  <button
                    type="button"
                    data-testid="focus-clear-done-btn"
                    onClick={handleClearDone}
                    className="hover:underline cursor-pointer"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    清理已完成
                  </button>
                </div>
                {doneItems.map((it) => (
                  <FocusRow
                    key={it.id}
                    item={it}
                    busy={busyId === it.id}
                    onToggleDone={handleToggleDone}
                    onEdit={(item) => {
                      setEditingItem(item)
                      setEditorOpen(true)
                    }}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <FocusQuickAddBar hasItemsAbove={hasVisibleRows} onAdd={handleQuickAdd} />
      </div>

      {editorOpen && (
        <FocusItemModal
          editing={editingItem}
          onClose={() => setEditorOpen(false)}
          onSaved={(next, msg) => {
            setData(next)
            setEditorOpen(false)
            onToast?.(msg)
          }}
        />
      )}

      {linksModalOpen && (
        <FocusLinksModal
          initialLinks={data?.external_links || []}
          onClose={() => setLinksModalOpen(false)}
          onSaved={(next) => {
            setData(next)
            setLinksModalOpen(false)
            onToast?.('快捷入口已更新')
          }}
        />
      )}
    </div>
  )
}
