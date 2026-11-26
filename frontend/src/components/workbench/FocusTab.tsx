import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  api,
  type FocusItem,
  type FocusState,
  type FocusUrgency,
} from '../../api/client'
import {
  FocusItemModal,
  FocusLinksModal,
  TAG_COLOR_META,
  URGENCY_META,
} from './FocusModals'

interface Props {
  onToast?: (msg: string) => void
}

function todayDisplayLabel(): string {
  const d = new Date()
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${week}`
}

export function FocusTab({ onToast }: Props) {
  const [data, setData] = useState<FocusState | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [quickTitle, setQuickTitle] = useState('')
  const [quickUrgency, setQuickUrgency] = useState<FocusUrgency>('plan')
  const [quickTag, setQuickTag] = useState('')
  const [adding, setAdding] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<FocusItem | null>(null)
  const [linksModalOpen, setLinksModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await api.getFocus()
      setData(res)
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

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = quickTitle.trim()
    if (!title || adding) return
    setAdding(true)
    setErr('')
    try {
      const res = await api.addFocusItem({
        title,
        urgency: quickUrgency,
        tag: quickTag.trim(),
      })
      setData(res.focus)
      setQuickTitle('')
      setQuickTag('')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '添加失败')
    } finally {
      setAdding(false)
    }
  }

  const items = data?.items || []
  const activeItems = items.filter((x) => !x.done)
  const doneItems = items.filter((x) => x.done)
  const summary = data?.summary || { total: 0, done: 0, remaining: 0, must: 0, soon: 0, plan: 0 }
  const pct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0
  const externalLinks = data?.external_links || []

  function renderFocusRow(item: FocusItem) {
    const urg = URGENCY_META[item.urgency] || URGENCY_META.plan
    const tagStyle = TAG_COLOR_META[item.tag_color] || TAG_COLOR_META.slate
    const isBusy = busyId === item.id

    return (
      <div
        key={item.id}
        data-testid={`focus-item-${item.id}`}
        className="group flex items-start gap-3 px-4 py-3.5 transition-colors"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          opacity: item.done ? 0.6 : 1,
        }}
      >
        <button
          type="button"
          data-testid={`focus-toggle-${item.id}`}
          disabled={isBusy}
          onClick={() => handleToggleDone(item)}
          className="mt-0.5 shrink-0 cursor-pointer pressable disabled:opacity-50"
          style={{ color: item.done ? 'var(--success)' : 'var(--text-muted)' }}
          title={item.done ? '标为未完成' : '标为已完成'}
        >
          {item.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
              style={{ background: urg.bg, color: urg.color }}
            >
              {urg.label}
            </span>

            {item.tag && (
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
                style={{ background: tagStyle.bg, color: tagStyle.color }}
              >
                {item.tag}
              </span>
            )}

            <span
              className={`text-[14px] font-medium leading-snug ${item.done ? 'line-through' : ''}`}
              style={{ color: 'var(--text-primary)' }}
            >
              {item.title}
            </span>

            {item.countdown && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] tabular-nums shrink-0"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                <Clock size={11} />
                <span>{item.countdown}</span>
              </span>
            )}
          </div>

          {item.progress && (
            <div className="text-[12.5px] leading-snug truncate" style={{ color: 'var(--text-muted)' }}>
              {item.progress}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              title="打开关联链接"
              className="p-1.5 rounded-lg sidebar-row"
              style={{ color: 'var(--text-muted)' }}
            >
              <ExternalLink size={13} />
            </a>
          )}
          <button
            type="button"
            data-testid={`focus-edit-${item.id}`}
            onClick={() => {
              setEditingItem(item)
              setEditorOpen(true)
            }}
            title="编辑"
            className="p-1.5 rounded-lg sidebar-row cursor-pointer lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            data-testid={`focus-delete-${item.id}`}
            disabled={isBusy}
            onClick={() => handleDelete(item)}
            title="删除"
            className="p-1.5 rounded-lg sidebar-row cursor-pointer lg:opacity-0 lg:group-hover:opacity-100 transition-opacity disabled:opacity-40"
            style={{ color: 'var(--text-muted)' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="focus-tab" className="space-y-4 animate-msg-in">
      {/* Top Progress + External Quick Links */}
      <div
        className="rounded-3xl p-4 sm:p-5 space-y-3.5"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-[15px] font-semibold tracking-tight">
                {todayDisplayLabel()}
              </span>
              <span
                data-testid="focus-progress-badge"
                className="px-2.5 py-0.5 rounded-full text-xs font-medium tabular-nums"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                已完成 {summary.done} / {summary.total}
              </span>
              {summary.must > 0 && (
                <span
                  className="px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums"
                  style={{ background: URGENCY_META.must.bg, color: URGENCY_META.must.color }}
                >
                  必须 {summary.must}
                </span>
              )}
              {summary.soon > 0 && (
                <span
                  className="px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums"
                  style={{ background: URGENCY_META.soon.bg, color: URGENCY_META.soon.color }}
                >
                  临近 {summary.soon}
                </span>
              )}
            </div>
            <div
              className="h-1.5 w-full sm:w-64 rounded-full overflow-hidden"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  background: pct === 100 && summary.total > 0 ? 'var(--success)' : 'var(--accent)',
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {externalLinks.map((lnk) => (
              <a
                key={lnk.id}
                href={lnk.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium sidebar-row"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span>{lnk.label}</span>
                <ExternalLink size={12} style={{ color: 'var(--text-muted)' }} />
              </a>
            ))}

            <button
              type="button"
              data-testid="focus-links-btn"
              onClick={() => setLinksModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <Link2 size={12} />
              <span>{externalLinks.length > 0 ? '入口' : '配置快捷入口'}</span>
            </button>

            {doneItems.length > 0 && (
              <button
                type="button"
                data-testid="focus-toggle-done-view"
                onClick={() => setShowDone((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium sidebar-row pressable cursor-pointer"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {showDone ? <EyeOff size={12} /> : <Eye size={12} />}
                <span>{showDone ? `收起已完成 (${doneItems.length})` : `查看已完成 (${doneItems.length})`}</span>
              </button>
            )}

            <button
              type="button"
              onClick={load}
              title="刷新"
              className="w-8 h-8 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              data-testid="focus-new-detail-btn"
              onClick={() => {
                setEditingItem(null)
                setEditorOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium pressable cursor-pointer"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              <Plus size={13} />
              <span>详细添加</span>
            </button>
          </div>
        </div>
      </div>

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

      {/* Focus Items Card */}
      <div
        data-testid="focus-list-card"
        className="rounded-3xl overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {loading && !data ? (
          <div className="py-12 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={15} className="animate-spin" />
            <span>正在加载今日焦点…</span>
          </div>
        ) : activeItems.length === 0 && (!showDone || doneItems.length === 0) ? (
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
            {activeItems.map(renderFocusRow)}

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
                {doneItems.map(renderFocusRow)}
              </div>
            )}
          </div>
        )}

        {/* Bottom 1-Row Quick Add */}
        <form
          onSubmit={handleQuickAdd}
          className="p-3 flex flex-wrap sm:flex-nowrap items-center gap-2"
          style={{
            background: 'var(--bg-sidebar)',
            borderTop: activeItems.length > 0 || (showDone && doneItems.length > 0) ? '1px solid var(--border-subtle)' : 'none',
          }}
        >
          <select
            data-testid="focus-quick-urgency"
            value={quickUrgency}
            onChange={(e) => setQuickUrgency(e.target.value as FocusUrgency)}
            className="px-2.5 py-2 rounded-xl text-xs font-medium outline-none cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: URGENCY_META[quickUrgency].color,
            }}
          >
            <option value="must">今日必须</option>
            <option value="soon">近期临近</option>
            <option value="plan">今日计划</option>
          </select>

          <input
            data-testid="focus-quick-title"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                // default form submit handles it cleanly
              } else if (e.key === 'Enter') {
                e.preventDefault()
              }
            }}
            placeholder="快速添加一条今日焦点，回车保存…"
            className="flex-1 min-w-[180px] px-3 py-2 rounded-xl text-sm outline-none"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />

          <input
            data-testid="focus-quick-tag"
            value={quickTag}
            onChange={(e) => setQuickTag(e.target.value)}
            placeholder="标签（可选）"
            className="w-24 sm:w-28 px-2.5 py-2 rounded-xl text-xs outline-none"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />

          <button
            type="submit"
            data-testid="focus-quick-submit"
            disabled={adding || !quickTitle.trim()}
            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-45"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
          >
            {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            <span>添加</span>
          </button>
        </form>
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
          initialLinks={externalLinks}
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
