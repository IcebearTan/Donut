import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Check } from 'lucide-react'
import type { WorkbenchModuleItem } from '../../api/client'
import { WorkbenchIcon } from './iconMap'

const MENU_STYLE = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  boxShadow: 'var(--shadow-md)',
} as const

function MenuItem({
  icon,
  label,
  active,
  onClick,
  testId,
}: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-[13px] font-medium pressable cursor-pointer hover:bg-(--bg-hover)"
      style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
    >
      <span className="shrink-0" style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {active && <Check size={14} className="shrink-0" />}
    </button>
  )
}

/** Lightweight popover under its trigger: closes on outside press or Escape. */
export function WorkbenchModuleMenu({
  modules,
  activeId,
  groups,
  triggerRef,
  onSelect,
  onClose,
}: {
  modules: WorkbenchModuleItem[]
  activeId: string
  /** Optional section labels, matched on the first module id of each group. */
  groups?: Array<{ startId: string; label: string }>
  triggerRef?: RefObject<HTMLElement | null>
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (triggerRef?.current?.contains(target)) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, triggerRef])

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="workbench-module-menu"
      className="absolute left-0 top-full mt-1.5 w-60 max-h-[70vh] overflow-y-auto z-40 rounded-2xl p-1.5 animate-pop-up"
      style={MENU_STYLE}
    >
      {modules.map((module) => {
        const heading = groups?.find((g) => g.startId === module.id)?.label
        return (
          <div key={module.id}>
            {heading && (
              <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                {heading}
              </div>
            )}
            <MenuItem
              icon={<WorkbenchIcon name={module.icon} size={15} />}
              label={module.name}
              active={module.id === activeId}
              onClick={() => onSelect(module.id)}
              testId={`workbench-menu-${module.id}`}
            />
          </div>
        )
      })}
    </div>
  )
}

export function usePopover() {
  const [open, setOpen] = useState(false)
  // Stable identities: the outside-press / Escape listeners do not re-subscribe on every render.
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((cur) => !cur), [])
  return { open, close, toggle }
}
