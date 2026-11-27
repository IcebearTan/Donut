import { Loader2, Plus, SlidersHorizontal } from 'lucide-react'
import type { WorkbenchModuleItem } from '../../api/client'
import { CronSummaryCard, FocusPreviewCard } from './WorkbenchHubBento'
import { WorkbenchToolsGrid } from './WorkbenchHubTools'
import { WorkbenchLedgerPreview } from './WorkbenchLedgerPreview'

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** `11月27日 · 周五` */
export function formatHubDate(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAY_LABELS[date.getDay()]}`
}

const PILL_CLASS =
  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-opacity pressable cursor-pointer hover:opacity-90'

interface Props {
  userId: string
  coreModules: WorkbenchModuleItem[]
  extModules: WorkbenchModuleItem[]
  loading: boolean
  onSelectModule: (id: string) => void
  onOpenManager: () => void
  onOpenQuickLedger?: () => void
  onToast?: (msg: string) => void
}

/** Landing view of the workbench: a two-card overview on top, the tool grid below. */
export function WorkbenchHub({
  userId,
  coreModules,
  extModules,
  loading,
  onSelectModule,
  onOpenManager,
  onOpenQuickLedger,
  onToast,
}: Props) {
  const enabledExtensions = extModules.filter((m) => m.enabled)
  const ledgerEnabled = enabledExtensions.some((m) => m.id === 'ledger')
  const tools = [...coreModules, ...enabledExtensions]

  return (
    <div data-testid="workbench-hub" className="animate-msg-in space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">工作台</h1>
          <p className="mt-1 text-[13.5px]" style={{ color: 'var(--text-muted)' }}>
            {formatHubDate(new Date())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ledgerEnabled && onOpenQuickLedger && (
            <button
              type="button"
              data-testid="workbench-quick-ledger-btn"
              onClick={onOpenQuickLedger}
              className={PILL_CLASS}
              style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
            >
              <Plus size={14} />
              <span>随手记一笔</span>
            </button>
          )}
          <button
            type="button"
            data-testid="workbench-manage-modules-btn"
            onClick={onOpenManager}
            className={PILL_CLASS}
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <SlidersHorizontal size={14} />}
            <span>管理扩展</span>
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <FocusPreviewCard onToast={onToast} onOpenAll={() => onSelectModule('focus')} />
        {ledgerEnabled ? (
          <WorkbenchLedgerPreview
            userId={userId}
            onToast={onToast}
            onOpenQuickLedger={onOpenQuickLedger}
            onOpenLedger={() => onSelectModule('ledger')}
          />
        ) : (
          <CronSummaryCard
            coreCount={coreModules.length}
            enabledCount={enabledExtensions.length}
            onOpenCron={() => onSelectModule('cron')}
          />
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-secondary)' }}>
          我的工具
        </h2>
        <WorkbenchToolsGrid
          modules={tools}
          loading={loading}
          onOpen={onSelectModule}
          onManage={onOpenManager}
        />
      </section>
    </div>
  )
}
