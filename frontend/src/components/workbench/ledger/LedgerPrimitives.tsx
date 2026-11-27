import type { ReactNode } from 'react'

export const ledgerPillButtonStyle = {
  background: 'var(--bg-sidebar)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
}

export const ledgerAccentButtonStyle = {
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
}

/** Pill-shaped button used for secondary (and, with `active`, primary) actions across the plugin. */
export function LedgerPillButton({
  icon,
  children,
  onClick,
  disabled = false,
  active = false,
  pressed,
  size = 'sm',
  testId,
}: {
  icon?: ReactNode
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  /** Filled with the accent color (e.g. the currently selected category). */
  active?: boolean
  /** Toggle state announced to assistive tech (style stays neutral). */
  pressed?: boolean
  /** `md` matches the height of a 1-line text input. */
  size?: 'sm' | 'md'
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={pressed ?? (active || undefined)}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 ${size === 'md' ? 'px-3.5 py-2.5 rounded-xl' : 'px-3 py-1.5 rounded-full'} text-xs font-medium sidebar-row pressable cursor-pointer disabled:opacity-50`}
      style={active ? ledgerAccentButtonStyle : ledgerPillButtonStyle}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

/** Small section heading with a leading icon and an optional right-aligned action. */
export function LedgerSectionTitle({ icon, title, extra }: { icon: ReactNode; title: string; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {icon}
        <span>{title}</span>
      </div>
      {extra}
    </div>
  )
}

/** Label + value figure (the month total itself is the hero figure, not a tile). */
export function LedgerStatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex-1 rounded-2xl px-3.5 py-3"
      style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-[17px] font-semibold mt-0.5">{value}</div>
    </div>
  )
}

/** Stacked form field: label on top, control underneath. */
export function LedgerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
      <span>{label}</span>
      {children}
    </label>
  )
}

/** Single-choice chip (category / payment method). */
export function LedgerChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-xl text-xs font-medium pressable cursor-pointer"
      style={{ background: active ? 'var(--accent)' : 'var(--bg-elevated)', color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)' }}
    >
      {children}
    </button>
  )
}
