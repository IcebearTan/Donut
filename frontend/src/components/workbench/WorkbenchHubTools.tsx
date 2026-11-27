import { ChevronRight, Loader2, Plus } from 'lucide-react'
import type { WorkbenchModuleItem } from '../../api/client'
import { WorkbenchIcon } from './iconMap'

const DESCRIPTION_FALLBACK: Record<string, string> = {
  focus: '今日必须、临近与计划事项',
  cron: '定时巡检与自动任务',
}

const KIND_BADGE: Record<WorkbenchModuleItem['kind'], string> = {
  core: '核心',
  builtin: '官方插件',
  template: '微应用',
  html: '微应用',
}

function describe(module: WorkbenchModuleItem): string {
  if (module.description.trim()) return module.description
  return DESCRIPTION_FALLBACK[module.id] || (module.kind === 'builtin' ? '工作台官方扩展' : 'AI 微应用')
}

/** Corner badge + chevron, kept faint so the module name stays the loudest element. */
function TileTrailing({ badge }: { badge: string }) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span
        className="px-1.5 py-0.5 rounded-md text-[10.5px] font-medium"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
      >
        {badge}
      </span>
      <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />
    </span>
  )
}

export function WorkbenchTile({
  module,
  index,
  onOpen,
}: {
  module: WorkbenchModuleItem
  index: number
  onOpen: (id: string) => void
}) {
  return (
    <button
      type="button"
      data-testid={`workbench-card-${module.id}`}
      onClick={() => onOpen(module.id)}
      className="animate-stagger-in text-left rounded-2xl p-4 flex items-center gap-3 min-w-0 transition-all pressable cursor-pointer hover:bg-(--bg-elevated) hover:border-(--border-strong) hover:shadow-sm"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        animationDelay: `${Math.min(index, 10) * 24}ms`,
      }}
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
      >
        <WorkbenchIcon name={module.icon} size={18} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate">{module.name}</span>
        <span className="block text-xs line-clamp-1" style={{ color: 'var(--text-muted)' }}>
          {describe(module)}
        </span>
      </span>
      <TileTrailing badge={KIND_BADGE[module.kind] || '微应用'} />
    </button>
  )
}

/** "My tools": every core module and enabled extension as one even grid, plus the manager shortcut. */
export function WorkbenchToolsGrid({
  modules,
  loading,
  onOpen,
  onManage,
}: {
  modules: WorkbenchModuleItem[]
  loading: boolean
  onOpen: (id: string) => void
  onManage: () => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {modules.map((module, index) => (
        <WorkbenchTile key={module.id} module={module} index={index} onOpen={onOpen} />
      ))}
      <button
        type="button"
        data-testid="workbench-manage-tile"
        onClick={onManage}
        className="animate-stagger-in text-left rounded-2xl p-4 flex items-center gap-3 min-w-0 border-2 border-dashed transition-colors pressable cursor-pointer hover:bg-(--bg-elevated) hover:border-(--border-strong)"
        style={{ borderColor: 'var(--border-strong)', animationDelay: `${Math.min(modules.length, 10) * 24}ms` }}
      >
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            管理扩展与微应用
          </span>
          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
            启用、排序或删除
          </span>
        </span>
      </button>
    </div>
  )
}
