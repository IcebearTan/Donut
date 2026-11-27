import { useRef } from 'react'
import { ArrowLeft, ChevronDown, Loader2, SlidersHorizontal } from 'lucide-react'
import type { WorkbenchModuleItem } from '../../api/client'
import { WorkbenchIcon } from './iconMap'
import { WorkbenchModuleMenu, usePopover } from './WorkbenchModuleMenu'

const ICON_BUTTON_CLASS =
  'p-2 rounded-full transition-colors sidebar-row pressable cursor-pointer hover:bg-(--bg-elevated)'

interface Props {
  /** Core modules first, then enabled extensions; the menu keeps this order. */
  modules: WorkbenchModuleItem[]
  activeId: string
  loading: boolean
  onBack: () => void
  onSelect: (id: string) => void
  onManage: () => void
}

/** Single-line top bar shown inside a module: back to the hub, jump between modules, manage. */
export function WorkbenchBreadcrumb({
  modules,
  activeId,
  loading,
  onBack,
  onSelect,
  onManage,
}: Props) {
  const menu = usePopover()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const active = modules.find((m) => m.id === activeId)
  const coreCount = modules.filter((m) => m.kind === 'core').length
  const groups =
    coreCount > 0 && coreCount < modules.length
      ? [
          { startId: modules[0].id, label: '核心模块' },
          { startId: modules[coreCount].id, label: '扩展与微应用' },
        ]
      : undefined

  return (
    <div
      data-testid="workbench-breadcrumb"
      className="relative z-30 flex items-center justify-between gap-2"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          type="button"
          data-testid="workbench-back-hub"
          onClick={onBack}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 -ml-2.5 rounded-full text-[13px] font-medium transition-colors sidebar-row pressable cursor-pointer hover:bg-(--bg-elevated)"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft size={14} />
          <span>工作台</span>
        </button>
        <span className="text-sm shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
          /
        </span>
        <div className="relative min-w-0">
          <button
            ref={triggerRef}
            type="button"
            data-testid="workbench-module-switcher"
            onClick={menu.toggle}
            aria-haspopup="menu"
            aria-expanded={menu.open}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm font-semibold tracking-tight transition-colors sidebar-row pressable cursor-pointer hover:bg-(--bg-elevated) max-w-full"
            style={{ color: 'var(--text-primary)' }}
          >
            {active && <WorkbenchIcon name={active.icon} size={15} className="shrink-0" />}
            <span className="truncate">{active?.name || '模块'}</span>
            <ChevronDown
              size={14}
              className="shrink-0 transition-transform"
              style={{ color: 'var(--text-muted)', transform: menu.open ? 'rotate(180deg)' : undefined }}
            />
          </button>
          {menu.open && (
            <WorkbenchModuleMenu
              modules={modules}
              activeId={activeId}
              groups={groups}
              triggerRef={triggerRef}
              onSelect={(id) => {
                menu.close()
                onSelect(id)
              }}
              onClose={menu.close}
            />
          )}
        </div>
      </div>

      <button
        type="button"
        data-testid="workbench-manage-modules-btn"
        title="管理扩展"
        aria-label="管理扩展"
        onClick={onManage}
        className={ICON_BUTTON_CLASS}
        style={{ color: 'var(--text-muted)' }}
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <SlidersHorizontal size={15} />}
      </button>
    </div>
  )
}
