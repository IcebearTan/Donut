import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type { FocusTagColor } from '../../../api/client'
import { TAG_COLOR_META } from '../focusMeta'
import type { CardItem } from './CardsTemplate'

function safeHref(url?: string): string {
  const u = (url || '').trim()
  if (/^https?:\/\//i.test(u) || u.startsWith('/')) return u
  return ''
}

export function CardEditorModal({
  editing,
  defaultCategory,
  saving,
  onClose,
  onSave,
}: {
  editing: CardItem | null
  defaultCategory: string
  saving: boolean
  onClose: () => void
  onSave: (nextCard: CardItem) => Promise<void>
}) {
  const [title, setTitle] = useState(editing?.title || '')
  const [category, setCategory] = useState(editing?.category || defaultCategory)
  const [badge, setBadge] = useState(editing?.badge || '')
  const [tone, setTone] = useState<FocusTagColor>((editing?.tone as FocusTagColor) || 'slate')
  const [summary, setSummary] = useState(editing?.summary || '')
  const [url, setUrl] = useState(editing?.url || '')

  const inputStyle = {
    background: 'var(--bg-sidebar)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await onSave({
      id: editing?.id || `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      category: category.trim(),
      badge: badge.trim(),
      tone,
      summary: summary.trim(),
      fields: editing?.fields || [],
      url: safeHref(url),
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
      onClick={() => !saving && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl p-5 space-y-3.5 animate-modal-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-semibold">{editing ? '编辑卡片' : '新增卡片'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl sidebar-row cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="卡片标题 *"
          className="w-full px-3 py-2 rounded-xl text-sm outline-none"
          style={inputStyle}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="分类（如 健康）"
            className="px-3 py-2 rounded-xl text-xs outline-none"
            style={inputStyle}
          />
          <input
            value={badge}
            onChange={(e) => setBadge(e.target.value)}
            placeholder="角标（如 12月）"
            className="px-3 py-2 rounded-xl text-xs outline-none"
            style={inputStyle}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TAG_COLOR_META) as FocusTagColor[]).map((ck) => {
            const m = TAG_COLOR_META[ck]
            return (
              <button
                key={ck}
                type="button"
                onClick={() => setTone(ck)}
                className="px-2.5 py-1 rounded-full text-[11px] cursor-pointer"
                style={{
                  background: m.bg,
                  color: m.color,
                  outline: tone === ck ? '1.5px solid var(--accent)' : 'none',
                }}
              >
                {m.label}
              </button>
            )
          })}
        </div>
        <textarea
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="摘要说明"
          className="w-full px-3 py-2 rounded-xl text-xs outline-none"
          style={inputStyle}
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="关联链接 https://...（可选）"
          className="w-full px-3 py-2 rounded-xl text-xs font-mono outline-none"
          style={inputStyle}
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs sidebar-row cursor-pointer"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            <span>保存</span>
          </button>
        </div>
      </form>
    </div>
  )
}
