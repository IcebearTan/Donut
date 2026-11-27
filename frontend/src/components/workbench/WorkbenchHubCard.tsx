import type { ReactNode } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'

const CARD_STYLE = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  boxShadow: 'var(--shadow-card)',
} as const


/** Small text link used for a card's "see everything" affordance. */
export function HubTextButton({
  children,
  onClick,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="inline-flex items-center gap-0.5 px-2 py-1 -mr-2 rounded-lg text-xs font-medium sidebar-row pressable cursor-pointer"
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </button>
  )
}

/** Shared shell of the hub overview cards: one header row, a flexible body, optional footer. */
export function HubCard({
  icon: Icon,
  title,
  badge,
  action,
  footer,
  testId,
  children,
}: {
  icon: LucideIcon
  title: string
  badge?: string
  action?: ReactNode
  footer?: ReactNode
  testId?: string
  children: ReactNode
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-2xl p-4 sm:p-5 flex flex-col gap-3 min-w-0"
      style={CARD_STYLE}
    >
      <header className="flex items-center gap-2 min-w-0">
        <Icon size={15} className="shrink-0" style={{ color: 'var(--text-secondary)' }} />
        <h2 className="text-sm font-semibold tracking-tight truncate">{title}</h2>
        {badge && (
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 tabular-nums"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
          >
            {badge}
          </span>
        )}
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </header>
      <div className="flex-1 min-w-0">{children}</div>
      {footer && <footer className="flex items-center gap-2 pt-3 -mb-1">{footer}</footer>}
    </section>
  )
}
