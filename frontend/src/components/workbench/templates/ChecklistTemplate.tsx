import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, Flame, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'

export interface ChecklistItem {
  id: string
  title: string
  note?: string
  group?: string
  done: boolean
  done_at?: number | null
}

interface ChecklistData {
  subtitle?: string
  reset_mode?: string
  streak_days?: number
  items?: ChecklistItem[]
}

interface Props {
  data: Record<string, unknown>
  saving: boolean
  onSave: (next: Record<string, unknown>) => Promise<void>
  onRefresh: () => void
}

export function ChecklistTemplate({ data, saving, onSave, onRefresh }: Props) {
  const typed = data as ChecklistData
  const items: ChecklistItem[] = Array.isArray(typed.items) ? typed.items : []
  const [groupFilter, setGroupFilter] = useState('ALL')
  const [newTitle, setNewTitle] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [newNote, setNewNote] = useState('')

  const groups = useMemo(
    () => Array.from(new Set(items.map((it) => (it.group || '').trim()).filter(Boolean))),
    [items],
  )
  const visible = useMemo(
    () => (groupFilter === 'ALL' ? items : items.filter((it) => (it.group || '').trim() === groupFilter)),
    [items, groupFilter],
  )
  const doneCount = items.filter((x) => x.done).length
  const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0
  const streak = Number(typed.streak_days || 0)

  const toggleItem = (id: string) =>
    onSave({
      ...data,
      items: items.map((it) =>
        it.id === id ? { ...it, done: !it.done, done_at: !it.done ? Date.now() : null } : it,
      ),
    })

  const deleteItem = (id: string) =>
    onSave({ ...data, items: items.filter((it) => it.id !== id) })

  const resetAll = () =>
    onSave({ ...data, items: items.map((it) => ({ ...it, done: false, done_at: null })) })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title || saving) return
    const item: ChecklistItem = {
      id: `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title,
      group: newGroup.trim(),
      note: newNote.trim(),
      done: false,
      done_at: null,
    }
    await onSave({ ...data, items: [...items, item] })
    setNewTitle('')
    setNewNote('')
  }

  return (
    <div data-testid="microapp-template-checklist" className="space-y-4 animate-msg-in">
      <div
        className="rounded-3xl p-4 sm:p-5 space-y-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                data-testid="checklist-progress"
                className="px-2.5 py-0.5 rounded-full text-xs font-medium tabular-nums"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                已完成 {doneCount} / {items.length}
              </span>
              {streak > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium tabular-nums"
                  style={{ background: 'rgba(217, 119, 6, 0.12)', color: '#d97706' }}
                >
                  <Flame size={12} />
                  <span>连续 {streak} 天</span>
                </span>
              )}
              {typed.reset_mode === 'daily' && (
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px]"
                  style={{ background: 'var(--bg-sidebar)', color: 'var(--text-muted)' }}
                >
                  每日自动重置
                </span>
              )}
            </div>
            {typed.subtitle && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{typed.subtitle}</p>}
            <div className="h-1.5 w-full sm:w-64 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  background: pct === 100 && items.length > 0 ? 'var(--success)' : 'var(--accent)',
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {groups.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {['ALL', ...groups].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroupFilter(g)}
                    className="px-2.5 py-1 rounded-full text-xs cursor-pointer pressable"
                    style={{
                      background: groupFilter === g ? 'var(--accent)' : 'var(--bg-sidebar)',
                      color: groupFilter === g ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {g === 'ALL' ? '全部' : g}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              disabled={saving || doneCount === 0}
              onClick={resetAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sidebar-row pressable cursor-pointer disabled:opacity-45"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <RotateCcw size={12} />
              <span>重置打卡</span>
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="w-8 h-8 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
              style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
              title="刷新"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        {visible.length === 0 ? (
          <div className="py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            暂无打卡项目，请在下方添加
          </div>
        ) : (
          <div>
            {visible.map((it) => (
              <div
                key={it.id}
                data-testid={`checklist-item-${it.id}`}
                className="group flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: '1px solid var(--border-subtle)', opacity: it.done ? 0.65 : 1 }}
              >
                <button
                  type="button"
                  data-testid={`checklist-toggle-${it.id}`}
                  disabled={saving}
                  onClick={() => toggleItem(it.id)}
                  className="shrink-0 cursor-pointer pressable"
                  style={{ color: it.done ? 'var(--success)' : 'var(--text-muted)' }}
                >
                  {it.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {it.group && (
                      <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                        {it.group}
                      </span>
                    )}
                    <span className={`text-[13.5px] font-medium ${it.done ? 'line-through' : ''}`}>{it.title}</span>
                  </div>
                  {it.note && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{it.note}</div>}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => deleteItem(it.id)}
                  className="p-1.5 rounded-lg sidebar-row cursor-pointer lg:opacity-0 lg:group-hover:opacity-100"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAdd} className="p-3 flex flex-wrap sm:flex-nowrap items-center gap-2" style={{ background: 'var(--bg-sidebar)' }}>
          <input
            data-testid="checklist-add-title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="新增打卡项（如：叶黄素 1 粒）…"
            className="flex-1 min-w-[160px] px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
          <input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder="分组"
            className="w-24 px-2.5 py-2 rounded-xl text-xs outline-none"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="备注（可选）"
            className="w-32 px-2.5 py-2 rounded-xl text-xs outline-none"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
          <button
            type="submit"
            data-testid="checklist-add-submit"
            disabled={saving || !newTitle.trim()}
            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-45"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            <Plus size={13} />
            <span>添加</span>
          </button>
        </form>
      </div>
    </div>
  )
}
