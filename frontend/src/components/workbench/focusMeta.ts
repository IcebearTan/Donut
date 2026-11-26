import type { FocusTagColor, FocusUrgency } from '../../api/client'

export const URGENCY_META: Record<
  FocusUrgency,
  { label: string; shortLabel: string; color: string; bg: string }
> = {
  must: {
    label: '今日必须',
    shortLabel: '必须',
    color: 'var(--danger)',
    bg: 'rgba(220, 38, 38, 0.10)',
  },
  soon: {
    label: '近期临近',
    shortLabel: '临近',
    color: '#d97706',
    bg: 'rgba(217, 119, 6, 0.12)',
  },
  plan: {
    label: '今日计划',
    shortLabel: '计划',
    color: 'var(--text-secondary)',
    bg: 'var(--bg-elevated)',
  },
}

export const TAG_COLOR_META: Record<
  FocusTagColor,
  { label: string; color: string; bg: string }
> = {
  slate: { label: '中性灰', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' },
  blue: { label: '晴空蓝', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.11)' },
  emerald: { label: '翠竹绿', color: 'var(--success)', bg: 'rgba(22, 163, 74, 0.11)' },
  amber: { label: '琥珀黄', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  rose: { label: '绯红', color: 'var(--danger)', bg: 'rgba(220, 38, 38, 0.11)' },
  violet: { label: '紫罗兰', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.11)' },
}
