import { CheckCircle2, Circle, Clock, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import type { FocusItem } from '../../api/client'
import { TAG_COLOR_META, URGENCY_META } from './focusMeta'

export function FocusRow({
  item,
  busy,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  item: FocusItem
  busy: boolean
  onToggleDone: (item: FocusItem) => void
  onEdit: (item: FocusItem) => void
  onDelete: (item: FocusItem) => void
}) {
  const urg = URGENCY_META[item.urgency] || URGENCY_META.plan
  const tagStyle = TAG_COLOR_META[item.tag_color] || TAG_COLOR_META.slate

  return (
    <div
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
        disabled={busy}
        onClick={() => onToggleDone(item)}
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
          <div
            title={item.progress}
            className="text-[12.5px] leading-relaxed line-clamp-2"
            style={{ color: 'var(--text-muted)' }}
          >
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
          onClick={() => onEdit(item)}
          title="编辑"
          className="p-1.5 rounded-lg sidebar-row cursor-pointer lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          data-testid={`focus-delete-${item.id}`}
          disabled={busy}
          onClick={() => onDelete(item)}
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
