import type { WorkbenchModuleItem } from '../../api/client'

const coreModule = (id: string, name: string, icon: string): WorkbenchModuleItem => ({
  id,
  kind: 'core',
  name,
  description: '',
  icon,
  enabled: true,
  removable: false,
})

/** Built-in modules, shown before the list loads and kept if it cannot be loaded. */
export const CORE_FALLBACK: WorkbenchModuleItem[] = [
  coreModule('focus', '今日焦点', 'focus'),
  coreModule('cron', '定时任务', 'clock'),
]
