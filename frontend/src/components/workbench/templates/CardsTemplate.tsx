import { useMemo, useState } from 'react'
import { ExternalLink, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { FocusTagColor } from '../../../api/client'
import { TAG_COLOR_META } from '../focusMeta'
import { CardEditorModal } from './CardEditorModal'

export interface CardItem {
  id: string
  title: string
  category?: string
  badge?: string
  tone?: FocusTagColor
  summary?: string
  fields?: Array<{ label: string; value: string }>
  url?: string
}

interface Props {
  data: Record<string, unknown>
  saving: boolean
  onSave: (next: Record<string, unknown>) => Promise<void>
  onRefresh: () => void
}

function safeHref(url?: string): string {
  const u = (url || '').trim()
  if (/^https?:\/\//i.test(u) || u.startsWith('/')) return u
  return ''
}

export function CardsTemplate({ data, saving, onSave, onRefresh }: Props) {
  const cards: CardItem[] = Array.isArray(data.cards)
    ? (data.cards as CardItem[]).map((c, i) => ({ ...c, id: String(c.id || `card_${i}`) }))
    : []

  const categories = useMemo(() => {
    const s = new Set<string>(['全部'])
    if (Array.isArray(data.categories)) {
      for (const c of data.categories) {
        if (typeof c === 'string' && c.trim()) s.add(c.trim())
      }
    }
    for (const c of cards) {
      if (c.category?.trim()) s.add(c.category.trim())
    }
    return Array.from(s)
  }, [data.categories, cards])

  const [activeCat, setActiveCat] = useState('全部')
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CardItem | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cards.filter((c) => {
      if (activeCat !== '全部' && (c.category || '').trim() !== activeCat) return false
      if (q) {
        const hay = `${c.title} ${c.category || ''} ${c.badge || ''} ${c.summary || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [cards, activeCat, query])

  async function handleSaveCard(nextCard: CardItem) {
    const nextCards = editing
      ? cards.map((c) => (c.id === editing.id ? nextCard : c))
      : [nextCard, ...cards]
    await onSave({ ...data, cards: nextCards })
    setModalOpen(false)
  }

  async function handleDelete(id: string) {
    await onSave({ ...data, cards: cards.filter((c) => c.id !== id) })
  }

  return (
    <div data-testid="microapp-template-cards" className="space-y-4 animate-msg-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCat(cat)}
              className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer pressable"
              style={{
                background: activeCat === cat ? 'var(--accent)' : 'var(--bg-surface)',
                color: activeCat === cat ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-44">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="筛选卡片…"
              className="w-full pl-8 pr-3 py-1.5 rounded-full text-xs outline-none"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="w-8 h-8 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            title="刷新"
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            data-testid="cards-add-btn"
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium pressable cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            <Plus size={13} />
            <span>新增卡片</span>
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div
          className="rounded-3xl py-12 text-center text-xs"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          暂无匹配的卡片内容
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {visible.map((c) => {
            const toneStyle = TAG_COLOR_META[c.tone || 'slate'] || TAG_COLOR_META.slate
            const href = safeHref(c.url)
            return (
              <div
                key={c.id}
                data-testid={`cards-item-${c.id}`}
                className="group rounded-3xl p-4 space-y-2.5 flex flex-col justify-between"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {c.category && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10.5px]"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                          >
                            {c.category}
                          </span>
                        )}
                        {c.badge && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10.5px] font-medium"
                            style={{ background: toneStyle.bg, color: toneStyle.color }}
                          >
                            {c.badge}
                          </span>
                        )}
                      </div>
                      <h3 className="text-[14.5px] font-semibold leading-snug">{c.title}</h3>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      {href && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg sidebar-row"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(c)
                          setModalOpen(true)
                        }}
                        className="p-1.5 rounded-lg sidebar-row cursor-pointer lg:opacity-0 lg:group-hover:opacity-100"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 rounded-lg sidebar-row cursor-pointer lg:opacity-0 lg:group-hover:opacity-100"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {c.summary && (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {c.summary}
                    </p>
                  )}

                  {Array.isArray(c.fields) && c.fields.length > 0 && (
                    <div className="pt-1 space-y-1">
                      {c.fields.map((f, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-[11.5px]">
                          <span style={{ color: 'var(--text-muted)' }}>{f.label}</span>
                          <span className="font-medium truncate">{f.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <CardEditorModal
          editing={editing}
          defaultCategory={activeCat !== '全部' ? activeCat : ''}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSaveCard}
        />
      )}
    </div>
  )
}
