import { useState } from 'react'
import { CalendarCheck2, Clock, ReceiptText } from 'lucide-react'
import type { UserProfile } from '../api/client'
import { CronView } from './CronView'
import { NotionScheduleTab } from './NotionScheduleTab'
import { ReimbursementTab } from './ReimbursementTab'

export type WorkbenchTab = 'reimbursements' | 'schedule' | 'cron'

interface Props {
  user: UserProfile
  onOpenVault: () => void
  onToast: (msg: string) => void
  onChanged?: () => void
}

function getInitialTab(): WorkbenchTab {
  try {
    const saved = sessionStorage.getItem('donut_workbench_tab')
    if (saved === 'reimbursements' || saved === 'schedule' || saved === 'cron') return saved
  } catch {
    // ignore
  }
  return 'reimbursements'
}

export function WorkbenchView({ user, onOpenVault, onToast, onChanged }: Props) {
  const [tab, setTab] = useState<WorkbenchTab>(getInitialTab)

  function switchTab(next: WorkbenchTab) {
    setTab(next)
    try {
      sessionStorage.setItem('donut_workbench_tab', next)
    } catch {
      // ignore
    }
  }

  const tabs: Array<{ id: WorkbenchTab; label: string; icon: React.ReactNode }> = [
    { id: 'reimbursements', label: '报销台账', icon: <ReceiptText size={15} /> },
    { id: 'schedule', label: '日程速览', icon: <CalendarCheck2 size={15} /> },
    { id: 'cron', label: '定时任务', icon: <Clock size={15} /> },
  ]

  return (
    <div data-testid="workbench-page" className="chat-scroll flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-14 space-y-6">
        {/* Header + Segmented Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">工作台</h1>
            <p className="text-[13.5px]" style={{ color: 'var(--text-muted)' }}>
              本地报销台账与原件打包、Notion 日程直连速览与自动定时巡检
            </p>
          </div>

          <div
            className="inline-flex items-center p-1 rounded-2xl self-start sm:self-auto"
            style={{
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {tabs.map((t) => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`workbench-tab-${t.id}`}
                  onClick={() => switchTab(t.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all pressable cursor-pointer"
                  style={{
                    background: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {tab === 'reimbursements' && (
          <ReimbursementTab onOpenVault={onOpenVault} onToast={onToast} />
        )}
        {tab === 'schedule' && <NotionScheduleTab onToast={onToast} />}
        {tab === 'cron' && <CronView user={user} embedded onChanged={onChanged} />}
      </div>
    </div>
  )
}
