import { ExternalLink, Eye, EyeOff, Link2, Plus, RefreshCw } from 'lucide-react'
import type { FocusExternalLink, FocusState } from '../../api/client'
import { URGENCY_META } from './focusMeta'

function todayDisplayLabel(): string {
  const d = new Date()
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${week}`
}

export function FocusHeaderCard({
  summary,
  externalLinks,
  doneCount,
  showDone,
  loading,
  onToggleShowDone,
  onOpenLinks,
  onRefresh,
  onNewDetail,
}: {
  summary: FocusState['summary']
  externalLinks: FocusExternalLink[]
  doneCount: number
  showDone: boolean
  loading: boolean
  onToggleShowDone: () => void
  onOpenLinks: () => void
  onRefresh: () => void
  onNewDetail: () => void
}) {
  const pct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0

  return (
    <div
      className="rounded-3xl p-4 sm:p-5 space-y-3.5"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[15px] font-semibold tracking-tight">{todayDisplayLabel()}</span>
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
            onClick={onOpenLinks}
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

          {doneCount > 0 && (
            <button
              type="button"
              data-testid="focus-toggle-done-view"
              onClick={onToggleShowDone}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {showDone ? <EyeOff size={12} /> : <Eye size={12} />}
              <span>{showDone ? `收起已完成 (${doneCount})` : `查看已完成 (${doneCount})`}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
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
            onClick={onNewDetail}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium pressable cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            <Plus size={13} />
            <span>详细添加</span>
          </button>
        </div>
      </div>
    </div>
  )
}
