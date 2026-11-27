import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronRight, Loader2, Target, Timer } from 'lucide-react'
import { api, type FocusItem, type FocusState } from '../../api/client'
import { URGENCY_META } from './focusMeta'
import { errorMessage } from './ledger/ledgerMeta'
import { HubCard, HubTextButton } from './WorkbenchHubCard'

const PREVIEW_COUNT = 4
const URGENCY_RANK: Record<FocusItem['urgency'], number> = { must: 0, soon: 1, plan: 2 }

function FocusPlaceholder({ lines }: { lines: number }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: lines }, (_, idx) => (
        <div
          key={idx}
          className="h-6 rounded-lg animate-soft-breathe"
          style={{ background: 'var(--bg-elevated)', width: `${88 - idx * 14}%` }}
        />
      ))}
    </div>
  )
}

/** Today's focus at a glance: the next few open items, each completable in one click. */
export function FocusPreviewCard({
  onToast,
  onOpenAll,
}: {
  onToast?: (msg: string) => void
  onOpenAll: () => void
}) {
  const [focus, setFocus] = useState<FocusState | null>(null)
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api
      .getFocus()
      .then((res) => alive && setFocus(res))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  const items = (focus?.items || []).filter((item) => !item.done)
  // Most urgent first; ties keep the user's own order.
  const preview = items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => URGENCY_RANK[a.item.urgency] - URGENCY_RANK[b.item.urgency] || a.idx - b.idx)
    .slice(0, PREVIEW_COUNT)
    .map(({ item }) => item)

  async function complete(item: FocusItem) {
    if (busyId) return
    setBusyId(item.id)
    try {
      const res = await api.updateFocusItem(item.id, { done: true })
      setFocus(res.focus)
      onToast?.(`已完成：${item.title}`)
    } catch (e) {
      onToast?.(errorMessage(e, '更新焦点事项失败'))
    } finally {
      setBusyId(null)
    }
  }

  function renderBody() {
    if (!focus) {
      return failed ? (
        <p className="py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          暂时无法加载今日焦点
        </p>
      ) : (
        <FocusPlaceholder lines={3} />
      )
    }
    if (preview.length === 0) {
      return (
        <div className="py-4 flex flex-col items-center gap-1.5 text-center">
          <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {focus.items.length === 0 ? '今天还没有安排焦点事项' : '今日焦点已全部完成'}
          </p>
        </div>
      )
    }
    return (
      <ul className="space-y-0.5 -mx-2">
        {preview.map((item) => {
          const pending = busyId === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={false}
                aria-label={`完成：${item.title}`}
                disabled={busyId !== null}
                onClick={() => complete(item)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-left pressable cursor-pointer hover:bg-(--bg-hover) disabled:cursor-default"
              >
                <span
                  className="w-[18px] h-[18px] rounded-full border shrink-0 flex items-center justify-center"
                  style={{ borderColor: 'var(--border-strong)' }}
                >
                  {pending && <Loader2 size={11} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
                </span>
                <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{item.title}</span>
                <span
                  className="px-1.5 py-0.5 rounded-md text-[10.5px] shrink-0"
                  style={{ color: URGENCY_META[item.urgency].color, background: URGENCY_META[item.urgency].bg }}
                >
                  {URGENCY_META[item.urgency].shortLabel}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <HubCard
      icon={Target}
      title="今日焦点"
      testId="workbench-focus-card"
      badge={focus ? `剩余 ${items.length} 项` : undefined}
      action={
        <HubTextButton onClick={onOpenAll} testId="workbench-focus-open-all">
          全部
          <ChevronRight size={13} />
        </HubTextButton>
      }
    >
      {renderBody()}
    </HubCard>
  )
}

/** Fallback for the second column when the ledger plugin is off. */
export function CronSummaryCard({
  coreCount,
  enabledCount,
  onOpenCron,
}: {
  coreCount: number
  enabledCount: number
  onOpenCron: () => void
}) {
  return (
    <HubCard
      icon={Timer}
      title="定时任务与工具状态"
      testId="workbench-cron-card"
      footer={
        <button
          type="button"
          onClick={onOpenCron}
          className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors pressable cursor-pointer hover:bg-(--bg-hover)"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
        >
          查看定时任务
          <ChevronRight size={13} />
        </button>
      }
    >
      <div className="flex items-end gap-2 py-1">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{coreCount + enabledCount}</span>
        <span className="text-xs pb-1.5" style={{ color: 'var(--text-muted)' }}>
          个工具已就绪
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        核心模块 {coreCount} 个，已启用扩展与微应用 {enabledCount} 个。定时巡检与自动任务按计划运行。
      </p>
    </HubCard>
  )
}
