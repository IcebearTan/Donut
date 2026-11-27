import {
  AppWindow,
  BookOpen,
  Calendar,
  CheckSquare,
  Clock,
  Code2,
  Coffee,
  Crosshair,
  Dumbbell,
  FileText,
  HeartPulse,
  LayoutGrid,
  ListTodo,
  Pill,
  Puzzle,
  ReceiptText,
  Sparkles,
  Table2,
  Target,
  Wallet,
} from 'lucide-react'

import { TomatoIcon } from './pomodoro/TomatoGraphic'

const ICON_MAP = {
  focus: Crosshair,
  crosshair: Crosshair,
  clock: Clock,
  receipt: ReceiptText,
  'receipt-text': ReceiptText,
  sparkles: Sparkles,
  'check-square': CheckSquare,
  checklist: CheckSquare,
  table: Table2,
  cards: LayoutGrid,
  'layout-grid': LayoutGrid,
  markdown: FileText,
  'file-text': FileText,
  pill: Pill,
  'heart-pulse': HeartPulse,
  'book-open': BookOpen,
  calendar: Calendar,
  wallet: Wallet,
  dumbbell: Dumbbell,
  coffee: Coffee,
  target: Target,
  'list-todo': ListTodo,
  code: Code2,
  puzzle: Puzzle,
  app: AppWindow,
} as const

export function WorkbenchIcon({
  name,
  size = 15,
  className = '',
}: {
  name?: string | null
  size?: number
  className?: string
}) {
  const key = (name || 'puzzle').trim().toLowerCase()
  if (key === 'pomodoro' || key === 'tomato') {
    return <TomatoIcon size={size} variant="outline" className={className} />
  }
  const Icon = ICON_MAP[key as keyof typeof ICON_MAP] || Puzzle
  return <Icon size={size} className={className} />
}
