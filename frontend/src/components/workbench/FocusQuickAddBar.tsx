import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import type { FocusUrgency } from '../../api/client'
import { URGENCY_META } from './focusMeta'

export function FocusQuickAddBar({
  hasItemsAbove,
  onAdd,
}: {
  hasItemsAbove: boolean
  onAdd: (payload: { title: string; urgency: FocusUrgency; tag: string }) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [urgency, setUrgency] = useState<FocusUrgency>('plan')
  const [tag, setTag] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const clean = title.trim()
    if (!clean || adding) return
    setAdding(true)
    try {
      await onAdd({ title: clean, urgency, tag: tag.trim() })
      setTitle('')
      setTag('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3 flex flex-wrap sm:flex-nowrap items-center gap-2"
      style={{
        background: 'var(--bg-sidebar)',
        borderTop: hasItemsAbove ? '1px solid var(--border-subtle)' : 'none',
      }}
    >
      <select
        data-testid="focus-quick-urgency"
        value={urgency}
        onChange={(e) => setUrgency(e.target.value as FocusUrgency)}
        className="px-2.5 py-2 rounded-xl text-xs font-medium outline-none cursor-pointer"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          color: URGENCY_META[urgency].color,
        }}
      >
        <option value="must">今日必须</option>
        <option value="soon">近期临近</option>
        <option value="plan">今日计划</option>
      </select>

      <input
        data-testid="focus-quick-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) {
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
        value={tag}
        onChange={(e) => setTag(e.target.value)}
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
        disabled={adding || !title.trim()}
        className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-45"
        style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
      >
        {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        <span>添加</span>
      </button>
    </form>
  )
}
