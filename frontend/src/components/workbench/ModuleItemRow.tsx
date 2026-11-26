import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import type { WorkbenchModuleItem } from '../../api/client'
import { WorkbenchIcon } from './iconMap'

function kindLabel(mod: WorkbenchModuleItem): string {
  if (mod.kind === 'builtin') return '内置精选'
  if (mod.kind === 'html') return 'HTML 沙箱'
  if (mod.template) return `模板 · ${mod.template}`
  return '微应用'
}

export function ModuleItemRow({
  mod,
  isFirst,
  isLast,
  saving,
  confirmingDelete,
  deleting,
  onMove,
  onToggle,
  onToggleDeleteConfirm,
  onConfirmDelete,
}: {
  mod: WorkbenchModuleItem
  isFirst: boolean
  isLast: boolean
  saving: boolean
  confirmingDelete: boolean
  deleting: boolean
  onMove: (delta: -1 | 1) => void
  onToggle: () => void
  onToggleDeleteConfirm: () => void
  onConfirmDelete?: () => void
}) {
  return (
    <div
      data-testid={`module-row-${mod.id}`}
      className="rounded-2xl p-3.5 space-y-2"
      style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: mod.enabled ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            <WorkbenchIcon name={mod.icon} size={16} />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold truncate">{mod.name}</span>
              <span
                className="px-2 py-0.5 rounded-full text-[10.5px] shrink-0"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
              >
                {kindLabel(mod)}
              </span>
            </div>
            {mod.description && (
              <p className="text-[11.5px] truncate" style={{ color: 'var(--text-muted)' }}>
                {mod.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={saving || isFirst}
            onClick={() => onMove(-1)}
            title="上移"
            data-testid={`module-up-${mod.id}`}
            className="p-1.5 rounded-lg sidebar-row cursor-pointer disabled:opacity-30"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ArrowUp size={13} />
          </button>
          <button
            type="button"
            disabled={saving || isLast}
            onClick={() => onMove(1)}
            title="下移"
            data-testid={`module-down-${mod.id}`}
            className="p-1.5 rounded-lg sidebar-row cursor-pointer disabled:opacity-30"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ArrowDown size={13} />
          </button>
          {mod.removable && onConfirmDelete && (
            <button
              type="button"
              disabled={saving || deleting}
              onClick={onToggleDeleteConfirm}
              title="删除微应用"
              data-testid={`module-delete-${mod.id}`}
              className="p-1.5 rounded-lg sidebar-row cursor-pointer disabled:opacity-30"
              style={{ color: 'var(--danger)' }}
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={mod.enabled}
            disabled={saving}
            data-testid={`module-toggle-${mod.id}`}
            onClick={onToggle}
            className="w-10 h-5.5 rounded-full p-0.5 transition-colors cursor-pointer disabled:opacity-50 relative"
            style={{ background: mod.enabled ? 'var(--accent)' : 'var(--border-strong)' }}
          >
            <span
              className="block w-4.5 h-4.5 rounded-full transition-transform"
              style={{
                background: mod.enabled ? 'var(--accent-contrast)' : 'var(--bg-surface)',
                transform: mod.enabled ? 'translateX(18px)' : 'translateX(0)',
              }}
            />
          </button>
        </div>
      </div>

      {confirmingDelete && onConfirmDelete && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}
        >
          <span style={{ color: 'var(--danger)' }}>确认删除微应用「{mod.name}」及其数据？</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleDeleteConfirm}
              className="px-2.5 py-1 rounded-lg text-[11px] cursor-pointer"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              取消
            </button>
            <button
              type="button"
              data-testid={`module-confirm-delete-${mod.id}`}
              disabled={deleting}
              onClick={onConfirmDelete}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--danger)', color: '#fff' }}
            >
              {deleting ? '删除中…' : '确认删除'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
