import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  api,
  type CronJobItem,
  type CronRunEntry,
  type CronSchedule,
  type CronSchedulerStatus,
  type UserProfile,
} from '../api/client'

interface Props {
  user: UserProfile
  onChanged?: () => void
}

type ScheduleMode = 'cron' | 'every' | 'at'

function formatDateTime(ts?: number | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${mm}-${dd} ${hh}:${min}`
}

function formatRelativeTime(ts?: number | null): string {
  if (!ts) return '未排期'
  const diff = ts - Date.now()
  if (diff < -60_000) return formatDateTime(ts)
  if (diff <= 0) return '即将执行'
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `${mins} 分钟后`
  const hours = Math.floor(mins / 60)
  const remM = mins % 60
  if (hours < 24) return remM > 0 ? `${hours} 小时 ${remM} 分钟后` : `${hours} 小时后`
  return formatDateTime(ts)
}

function formatDuration(ms?: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatScheduleLabel(s: CronSchedule): string {
  if (s.kind === 'cron') {
    const parts = s.expr.trim().split(/\s+/)
    if (parts.length === 5) {
      const [m, h, dom, mon, dow] = parts
      const hh = h.padStart(2, '0')
      const mm = m.padStart(2, '0')
      if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === '*' && mon === '*') {
        if (dow === '*') return `每天 ${hh}:${mm}`
        if (dow === '1-5') return `工作日 ${hh}:${mm}`
        if (dow === '0,6' || dow === '6,0') return `周末 ${hh}:${mm}`
        const weekMap: Record<string, string> = {
          '0': '周日',
          '1': '周一',
          '2': '周二',
          '3': '周三',
          '4': '周四',
          '5': '周五',
          '6': '周六',
          '7': '周日',
        }
        if (weekMap[dow]) return `每${weekMap[dow]} ${hh}:${mm}`
      }
    }
    return `Cron: ${s.expr}`
  }
  if (s.kind === 'every') {
    const mins = Math.round(s.everyMs / 60_000)
    if (mins % (60 * 24) === 0) return `每 ${mins / (60 * 24)} 天`
    if (mins % 60 === 0) return `每 ${mins / 60} 小时`
    return `每 ${mins} 分钟`
  }
  if (s.kind === 'at') {
    const d = new Date(s.at)
    if (!Number.isNaN(d.getTime())) {
      return `单次 · ${formatDateTime(d.getTime())}`
    }
    return `单次 · ${s.at}`
  }
  return '自定义计划'
}

const CRON_PRESETS = [
  { label: '每天 09:00', expr: '0 9 * * *' },
  { label: '每天 21:00', expr: '0 21 * * *' },
  { label: '工作日 09:00', expr: '0 9 * * 1-5' },
  { label: '每周一 09:00', expr: '0 9 * * 1' },
  { label: '每月 1 日 09:00', expr: '0 9 1 * *' },
]

const EVERY_PRESETS = [
  { label: '15 分钟', mins: 15 },
  { label: '30 分钟', mins: 30 },
  { label: '1 小时', mins: 60 },
  { label: '6 小时', mins: 360 },
  { label: '24 小时', mins: 1440 },
]

function toLocalInputValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600_000)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CronView({ user, onChanged }: Props) {
  const [scheduler, setScheduler] = useState<CronSchedulerStatus | null>(null)
  const [jobs, setJobs] = useState<CronJobItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toastMsg, setToastMsg] = useState('')

  // Busy states per job
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)

  // Create / Edit modal
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<CronJobItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formEnabled, setFormEnabled] = useState(true)
  const [formMode, setFormMode] = useState<ScheduleMode>('cron')
  const [formCronExpr, setFormCronExpr] = useState('0 9 * * *')
  const [formCronTz, setFormCronTz] = useState('Asia/Shanghai')
  const [formEveryMins, setFormEveryMins] = useState(60)
  const [formAtLocal, setFormAtLocal] = useState(() => toLocalInputValue())
  const [formDeleteAfterRun, setFormDeleteAfterRun] = useState(false)
  const [saving, setSaving] = useState(false)

  // Runs history drawer/modal
  const [runsJob, setRunsJob] = useState<CronJobItem | null>(null)
  const [runs, setRuns] = useState<CronRunEntry[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)

  // Delete confirm modal
  const [confirmDelete, setConfirmDelete] = useState<CronJobItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const assistantName = user.assistant_name || 'Donut'

  const showNotice = useCallback((text: string) => {
    setToastMsg(text)
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === text ? '' : prev))
    }, 2800)
  }, [])

  const loadJobs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.listCronJobs()
      setScheduler(res.scheduler)
      setJobs(res.jobs)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载定时任务失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  const userJobs = useMemo(() => jobs.filter((j) => !j.is_system), [jobs])
  const systemJobs = useMemo(() => jobs.filter((j) => j.is_system), [jobs])
  const activeCount = useMemo(() => jobs.filter((j) => j.enabled).length, [jobs])
  const errorCount = useMemo(
    () => jobs.filter((j) => j.last_status === 'error' || j.consecutive_errors > 0).length,
    [jobs],
  )
  const soonestWake = useMemo(() => {
    const times = jobs
      .filter((j) => j.enabled && j.next_run_at)
      .map((j) => j.next_run_at as number)
    if (times.length === 0) return scheduler?.next_wake_at || null
    return Math.min(...times)
  }, [jobs, scheduler])

  function openCreateModal() {
    setEditingJob(null)
    setFormName('')
    setFormDesc('')
    setFormMessage('')
    setFormEnabled(true)
    setFormMode('cron')
    setFormCronExpr('0 9 * * *')
    setFormCronTz('Asia/Shanghai')
    setFormEveryMins(60)
    setFormAtLocal(toLocalInputValue())
    setFormDeleteAfterRun(false)
    setError('')
    setEditorOpen(true)
  }

  function openEditModal(job: CronJobItem) {
    setEditingJob(job)
    setFormName(job.name)
    setFormDesc(job.description || '')
    setFormMessage(job.message || '')
    setFormEnabled(job.enabled)
    setFormDeleteAfterRun(Boolean(job.delete_after_run))
    if (job.schedule.kind === 'cron') {
      setFormMode('cron')
      setFormCronExpr(job.schedule.expr)
      setFormCronTz(job.schedule.tz || 'Asia/Shanghai')
    } else if (job.schedule.kind === 'every') {
      setFormMode('every')
      setFormEveryMins(Math.max(1, Math.round(job.schedule.everyMs / 60_000)))
    } else {
      setFormMode('at')
      setFormAtLocal(toLocalInputValue(job.schedule.at))
    }
    setError('')
    setEditorOpen(true)
  }

  async function handleSaveJob(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim() || !formMessage.trim()) return
    let schedule: CronSchedule
    if (formMode === 'cron') {
      schedule = {
        kind: 'cron',
        expr: formCronExpr.trim(),
        tz: formCronTz.trim() || 'Asia/Shanghai',
      }
    } else if (formMode === 'every') {
      schedule = {
        kind: 'every',
        everyMs: Math.max(1, Number(formEveryMins) || 60) * 60_000,
      }
    } else {
      const parsed = new Date(formAtLocal)
      if (Number.isNaN(parsed.getTime())) {
        setError('请选择有效的执行日期与时间')
        return
      }
      schedule = { kind: 'at', at: parsed.toISOString() }
    }

    setSaving(true)
    setError('')
    try {
      if (editingJob) {
        await api.updateCronJob(editingJob.id, {
          name: formName.trim(),
          description: formDesc.trim(),
          message: formMessage.trim(),
          schedule,
          enabled: formEnabled,
          delete_after_run: formMode === 'at' ? formDeleteAfterRun : false,
        })
        showNotice(`已更新定时任务「${formName.trim()}」`)
      } else {
        await api.createCronJob({
          name: formName.trim(),
          description: formDesc.trim(),
          message: formMessage.trim(),
          schedule,
          enabled: formEnabled,
          delete_after_run: formMode === 'at' ? formDeleteAfterRun : false,
        })
        showNotice(`已创建定时任务「${formName.trim()}」`)
      }
      setEditorOpen(false)
      await loadJobs()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleJob(job: CronJobItem) {
    setTogglingId(job.id)
    setError('')
    try {
      const res = await api.updateCronJob(job.id, { enabled: !job.enabled })
      setJobs((prev) => prev.map((j) => (j.id === job.id ? res.job : j)))
      showNotice(res.job.enabled ? `已启用「${job.name}」` : `已暂停「${job.name}」`)
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换状态失败')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleRunNow(job: CronJobItem) {
    setRunningId(job.id)
    setError('')
    try {
      await api.runCronJob(job.id)
      showNotice(`已立即触发「${job.name}」`)
      await loadJobs()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '立即执行失败')
    } finally {
      setRunningId(null)
    }
  }

  async function handleOpenRuns(job: CronJobItem) {
    setRunsJob(job)
    setRuns([])
    setLoadingRuns(true)
    try {
      const res = await api.getCronRuns(job.id, 25)
      setRuns(res.runs)
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取运行记录失败')
    } finally {
      setLoadingRuns(false)
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    setError('')
    try {
      await api.deleteCronJob(confirmDelete.id)
      showNotice(`已删除「${confirmDelete.name}」`)
      setConfirmDelete(null)
      await loadJobs()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  function renderJobCard(job: CronJobItem) {
    const isToggling = togglingId === job.id
    const isRunning = runningId === job.id
    const hasErr = job.last_status === 'error' || job.consecutive_errors > 0

    return (
      <div
        key={job.id}
        data-testid={`cron-job-card-${job.id}`}
        className="p-4 rounded-2xl space-y-3 transition-colors"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          opacity: job.enabled ? 1 : 0.78,
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: !job.enabled
                    ? 'var(--text-muted)'
                    : hasErr
                      ? 'var(--danger)'
                      : 'var(--success)',
                }}
              />
              <h3 className="text-[15px] font-semibold truncate">{job.name}</h3>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Clock size={11} />
                <span>{formatScheduleLabel(job.schedule)}</span>
              </span>
              {job.is_system && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]"
                  style={{
                    background: 'var(--bg-sidebar)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <ShieldCheck size={11} />
                  <span>系统内置</span>
                </span>
              )}
            </div>

            {job.description && (
              <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                {job.description}
              </p>
            )}
          </div>

          {/* Actions toolbar */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <button
              type="button"
              disabled={isToggling}
              onClick={() => handleToggleJob(job)}
              title={job.enabled ? '暂停任务' : '启用任务'}
              data-testid={`cron-toggle-${job.id}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium sidebar-row pressable cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--bg-elevated)',
                color: job.enabled ? 'var(--text-primary)' : 'var(--success)',
              }}
            >
              {isToggling ? (
                <Loader2 size={12} className="animate-spin" />
              ) : job.enabled ? (
                <Pause size={12} />
              ) : (
                <Play size={12} />
              )}
              <span>{job.enabled ? '暂停' : '启用'}</span>
            </button>

            <button
              type="button"
              disabled={isRunning}
              onClick={() => handleRunNow(job)}
              title="立即触发执行一次"
              data-testid={`cron-run-${job.id}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium sidebar-row pressable cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
              }}
            >
              {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              <span>{isRunning ? '执行中…' : '立即运行'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenRuns(job)}
              title="查看历史运行记录"
              data-testid={`cron-runs-btn-${job.id}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
              }}
            >
              <History size={12} />
              <span>记录</span>
            </button>

            {!job.is_system && (
              <>
                <button
                  type="button"
                  onClick={() => openEditModal(job)}
                  title="编辑任务"
                  data-testid={`cron-edit-${job.id}`}
                  className="p-2 rounded-xl sidebar-row pressable cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(job)}
                  title="删除任务"
                  data-testid={`cron-delete-${job.id}`}
                  className="p-2 rounded-xl sidebar-row pressable cursor-pointer"
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Instruction preview (skip internal magic token for system dream) */}
        {!job.is_system && job.message && (
          <div
            className="px-3 py-2 rounded-xl text-xs leading-relaxed line-clamp-2"
            style={{
              background: 'var(--bg-sidebar)',
              color: 'var(--text-secondary)',
            }}
          >
            指令：{job.message}
          </div>
        )}

        {/* Meta footer */}
        <div
          className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[11.5px] pt-1 tabular-nums"
          style={{ color: 'var(--text-muted)' }}
        >
          <span>
            下次执行：{job.enabled ? formatRelativeTime(job.next_run_at) : '已暂停'}
          </span>
          <span>
            上次执行：
            {job.last_run_at ? (
              <>
                {formatDateTime(job.last_run_at)} ·{' '}
                <span
                  style={{
                    color: hasErr ? 'var(--danger)' : 'var(--success)',
                  }}
                >
                  {job.last_status || 'ok'}
                </span>
                {job.last_duration_ms != null && ` (${formatDuration(job.last_duration_ms)})`}
              </>
            ) : (
              '尚未执行'
            )}
          </span>
        </div>

        {job.last_error && (
          <div
            className="text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--danger)',
            }}
          >
            <AlertCircle size={13} className="shrink-0" />
            <span className="truncate">{job.last_error}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div data-testid="cron-page" className="chat-scroll flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-12 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">定时任务</h1>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: scheduler?.enabled ? 'var(--success)' : 'var(--text-muted)',
                  }}
                />
                <span>
                  {scheduler?.enabled ? 'OpenClaw 调度器运行中' : '调度器状态未知'}
                </span>
              </span>
            </div>
            <p className="text-[13.5px]" style={{ color: 'var(--text-muted)' }}>
              让 {assistantName} 按计划自动巡检、汇总日报、提醒事项或整理长期记忆（与你的聊天对话实时同步）
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadJobs}
              title="刷新"
              className="w-9 h-9 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              data-testid="cron-create-btn"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium pressable cursor-pointer"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Plus size={15} />
              <span>新建定时任务</span>
            </button>
          </div>
        </div>

        {toastMsg && (
          <div
            className="px-4 py-2.5 rounded-2xl text-xs font-medium flex items-center gap-2 animate-msg-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--success)',
            }}
          >
            <CheckCircle2 size={14} />
            <span>{toastMsg}</span>
          </div>
        )}

        {error && (
          <div
            className="px-4 py-3 rounded-2xl text-xs"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--danger)',
              color: 'var(--danger)',
            }}
          >
            {error}
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div
            className="p-4 rounded-2xl"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              运行中 / 总任务
            </div>
            <div className="text-xl font-semibold mt-1 tabular-nums">
              {activeCount} <span className="text-sm font-normal opacity-60">/ {jobs.length}</span>
            </div>
          </div>

          <div
            className="p-4 rounded-2xl"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              下一次唤醒
            </div>
            <div className="text-xl font-semibold mt-1 tabular-nums">
              {formatRelativeTime(soonestWake)}
            </div>
          </div>

          <div
            className="p-4 rounded-2xl"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              近期健康状态
            </div>
            <div
              className="text-xl font-semibold mt-1 tabular-nums"
              style={{ color: errorCount > 0 ? 'var(--danger)' : 'var(--success)' }}
            >
              {errorCount > 0 ? `${errorCount} 项异常` : '全部正常'}
            </div>
          </div>
        </div>

        {loading ? (
          <div
            className="py-20 flex flex-col items-center justify-center gap-2.5 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <Loader2 size={20} className="animate-spin" />
            <span>正在读取 OpenClaw 定时调度器…</span>
          </div>
        ) : (
          <div className="space-y-7">
            {/* User Created Jobs */}
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">我的定时任务（{userJobs.length}）</h2>
              </div>

              {userJobs.length === 0 ? (
                <div
                  className="py-12 px-6 text-center rounded-3xl space-y-3"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <CalendarClock size={28} className="mx-auto opacity-55" />
                  <div className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    还没有自定义的定时任务
                  </div>
                  <p className="text-xs max-w-md mx-auto leading-relaxed">
                    点击右上角「新建定时任务」，或在聊天里直接对 {assistantName} 说「每天早上 9 点帮我整理 Notion 待办」，都会同步显示在这里。
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">{userJobs.map(renderJobCard)}</div>
              )}
            </section>

            {/* System Built-in Jobs */}
            {systemJobs.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    系统内置自动化（{systemJobs.length}）
                  </h2>
                </div>
                <div className="space-y-2.5">{systemJobs.map(renderJobCard)}</div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
          onClick={() => !saving && setEditorOpen(false)}
        >
          <form
            onSubmit={handleSaveJob}
            data-testid="cron-editor-modal"
            className="w-full max-w-lg rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-modal-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold">
                {editingJob ? '编辑定时任务' : '新建定时任务'}
              </h3>
              <button
                type="button"
                onClick={() => !saving && setEditorOpen(false)}
                className="p-1.5 rounded-lg sidebar-row cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  任务名称
                </label>
                <input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如：每日晨间简报"
                  data-testid="cron-input-name"
                  className="w-full px-3.5 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              </div>

              {/* Schedule Type Selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  触发频率
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['cron', '周期时间 (Cron)'],
                      ['every', '固定间隔'],
                      ['at', '指定时间单次'],
                    ] as Array<[ScheduleMode, string]>
                  ).map(([modeKey, label]) => (
                    <button
                      key={modeKey}
                      type="button"
                      onClick={() => setFormMode(modeKey)}
                      className="px-2.5 py-2 rounded-xl text-xs font-medium pressable cursor-pointer"
                      style={{
                        background: formMode === modeKey ? 'var(--accent)' : 'var(--bg-elevated)',
                        color:
                          formMode === modeKey ? 'var(--accent-contrast)' : 'var(--text-primary)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {formMode === 'cron' && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap gap-1.5">
                      {CRON_PRESETS.map((p) => (
                        <button
                          key={p.expr}
                          type="button"
                          onClick={() => setFormCronExpr(p.expr)}
                          className="px-2.5 py-1 rounded-lg text-[11px] sidebar-row cursor-pointer"
                          style={{
                            background:
                              formCronExpr.trim() === p.expr ? 'var(--accent)' : 'var(--bg-sidebar)',
                            color:
                              formCronExpr.trim() === p.expr
                                ? 'var(--accent-contrast)'
                                : 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        required
                        value={formCronExpr}
                        onChange={(e) => setFormCronExpr(e.target.value)}
                        placeholder="分 时 日 月 周 (0 9 * * *)"
                        data-testid="cron-input-expr"
                        className="sm:col-span-2 px-3 py-2 rounded-xl text-sm font-mono outline-none"
                        style={{
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      />
                      <input
                        value={formCronTz}
                        onChange={(e) => setFormCronTz(e.target.value)}
                        placeholder="Asia/Shanghai"
                        className="px-3 py-2 rounded-xl text-xs outline-none"
                        style={{
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      />
                    </div>
                  </div>
                )}

                {formMode === 'every' && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap gap-1.5">
                      {EVERY_PRESETS.map((p) => (
                        <button
                          key={p.mins}
                          type="button"
                          onClick={() => setFormEveryMins(p.mins)}
                          className="px-2.5 py-1 rounded-lg text-[11px] sidebar-row cursor-pointer"
                          style={{
                            background:
                              formEveryMins === p.mins ? 'var(--accent)' : 'var(--bg-sidebar)',
                            color:
                              formEveryMins === p.mins
                                ? 'var(--accent-contrast)'
                                : 'var(--text-secondary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          每 {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        每隔
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={43200}
                        value={formEveryMins}
                        onChange={(e) => setFormEveryMins(Number(e.target.value))}
                        className="w-28 px-3 py-2 rounded-xl text-sm outline-none tabular-nums"
                        style={{
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        分钟执行一次
                      </span>
                    </div>
                  </div>
                )}

                {formMode === 'at' && (
                  <div className="space-y-2 pt-1">
                    <input
                      type="datetime-local"
                      value={formAtLocal}
                      onChange={(e) => setFormAtLocal(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    />
                    <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formDeleteAfterRun}
                        onChange={(e) => setFormDeleteAfterRun(e.target.checked)}
                      />
                      <span style={{ color: 'var(--text-secondary)' }}>执行成功后自动删除该一次性任务</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  给 {assistantName} 的执行指令
                </label>
                <textarea
                  required
                  rows={4}
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  placeholder="例如：帮我检查 Notion 中今天的待办事项和日历安排，整理一份简明重点写入今日记忆。"
                  data-testid="cron-input-message"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none resize-y"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  备注说明（可选）
                </label>
                <input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="简短记录这个任务的用途"
                  className="w-full px-3.5 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                />
                <span style={{ color: 'var(--text-secondary)' }}>创建/保存后立即启用调度</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 rounded-xl text-[13.5px] font-medium sidebar-row pressable cursor-pointer"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving || !formName.trim() || !formMessage.trim()}
                data-testid="cron-save-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13.5px] font-medium pressable cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                <span>{editingJob ? '保存修改' : '创建任务'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Run History Modal */}
      {runsJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
          onClick={() => setRunsJob(null)}
        >
          <div
            data-testid="cron-runs-modal"
            className="w-full max-w-xl rounded-2xl p-5 space-y-4 max-h-[85vh] flex flex-col animate-modal-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-[16px] font-semibold">执行记录 · {runsJob.name}</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  最近 {runs.length} 次调度执行详情
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRunsJob(null)}
                className="p-1.5 rounded-lg sidebar-row cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {loadingRuns ? (
                <div
                  className="py-14 flex items-center justify-center gap-2 text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Loader2 size={16} className="animate-spin" />
                  <span>正在加载执行日志…</span>
                </div>
              ) : runs.length === 0 ? (
                <div
                  className="py-14 text-center text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  该任务还没有历史执行记录
                </div>
              ) : (
                runs.map((r) => {
                  const isOk = r.status === 'ok' || r.status === 'succeeded'
                  return (
                    <div
                      key={r.id}
                      className="p-3 rounded-xl space-y-1.5 text-xs"
                      style={{
                        background: 'var(--bg-sidebar)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium tabular-nums">
                          {formatDateTime(r.run_at || r.ts)}
                        </span>
                        <div className="flex items-center gap-2 tabular-nums">
                          {r.model && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px]"
                              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                            >
                              {r.model}
                            </span>
                          )}
                          {r.duration_ms != null && (
                            <span style={{ color: 'var(--text-muted)' }}>
                              {formatDuration(r.duration_ms)}
                            </span>
                          )}
                          <span
                            className="px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: 'var(--bg-elevated)',
                              color: isOk ? 'var(--success)' : 'var(--danger)',
                            }}
                          >
                            {r.status}
                          </span>
                        </div>
                      </div>
                      {r.summary && (
                        <div
                          className="leading-relaxed whitespace-pre-wrap break-all"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {r.summary}
                        </div>
                      )}
                      {r.error && (
                        <div className="leading-relaxed" style={{ color: 'var(--danger)' }}>
                          错误：{r.error}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-4 animate-modal-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-[16px] font-semibold">删除这个定时任务？</h3>
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                将永久移除「<span className="font-medium" style={{ color: 'var(--text-primary)' }}>{confirmDelete.name}</span>」，之后不会再自动触发。
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-[13.5px] font-medium sidebar-row pressable cursor-pointer"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13.5px] font-medium pressable cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--danger)', color: '#ffffff' }}
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                <span>确认删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
