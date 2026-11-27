/** Bespoke vector tomato SVG & duration presets for the Pomodoro workbench plugin. */

export interface PomodoroPreset {
  id: string
  label: string
  subtitle: string
  focus: number
  shortBreak: number
  longBreak: number
}

export const POMODORO_PRESETS: PomodoroPreset[] = [
  { id: 'classic', label: '标准 25/5', subtitle: '经典番茄节奏', focus: 25, shortBreak: 5, longBreak: 15 },
  { id: 'deep', label: '深度 45/10', subtitle: '考研 / 深度学习', focus: 45, shortBreak: 10, longBreak: 20 },
  { id: 'sprint', label: '长专注 50/10', subtitle: '一节课沉浸冲刺', focus: 50, shortBreak: 10, longBreak: 20 },
]

export function TomatoIcon({
  size = 20,
  variant = 'ripe',
  className = '',
}: {
  size?: number
  variant?: 'ripe' | 'empty' | 'outline'
  className?: string
}) {
  if (variant === 'outline') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        <path d="M12 6.5c-4.5 0-8 2.8-8 7.1C4 18 7.5 21 12 21s8-3 8-7.4c0-4.3-3.5-7.1-8-7.1Z" />
        <path d="M12 6.5V3.5" />
        <path d="M12 6.5c-1.4-1.5-3.3-1.8-4.5-1.1" />
        <path d="M12 6.5c1.4-1.5 3.3-1.8 4.5-1.1" />
      </svg>
    )
  }

  const bodyFill = variant === 'ripe' ? '#E5534B' : 'var(--bg-elevated)'
  const bodyStroke = variant === 'ripe' ? '#C93D36' : 'var(--border-strong)'
  const leafFill = variant === 'ripe' ? '#3DA35D' : 'var(--border-strong)'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M14 7.5C8.5 7.5 4.5 10.9 4.5 16.1C4.5 21.1 8.6 24.5 14 24.5C19.4 24.5 23.5 21.1 23.5 16.1C23.5 10.9 19.5 7.5 14 7.5Z"
        fill={bodyFill}
        stroke={bodyStroke}
        strokeWidth={variant === 'ripe' ? '1.1' : '1.4'}
        strokeDasharray={variant === 'empty' ? '2.5 2.5' : undefined}
      />
      {variant === 'ripe' && (
        <path
          d="M9.4 12.2C8.3 13.3 7.9 14.9 8.2 16.5"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
      <path
        d="M14 7.8C13.6 5.6 14.4 4.1 15.6 3.3"
        stroke={leafFill}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M14 8.2C12.3 6.3 10.1 6.1 8.7 7.1C10.5 7.8 12.1 8.8 14 8.2Z"
        fill={leafFill}
      />
      <path
        d="M14 8.2C15.7 6.3 17.9 6.1 19.3 7.1C17.5 7.8 15.9 8.8 14 8.2Z"
        fill={leafFill}
      />
    </svg>
  )
}
