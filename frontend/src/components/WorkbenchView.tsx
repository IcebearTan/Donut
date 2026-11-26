import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import {
  api,
  type UserProfile,
  type WorkbenchModuleItem,
} from '../api/client'
import { CronView } from './CronView'
import { ReimbursementTab } from './ReimbursementTab'
import { FocusTab } from './workbench/FocusTab'
import { WorkbenchIcon } from './workbench/iconMap'
import { MicroAppHost } from './workbench/MicroAppHost'
import { ModuleManagerModal } from './workbench/ModuleManagerModal'

interface Props {
  user: UserProfile
  onOpenVault: () => void
  onToast: (msg: string) => void
  onChanged?: () => void
}

function getInitialTab(userId: string): string {
  try {
    const saved = sessionStorage.getItem(`donut_workbench_tab_${userId}`)
    if (saved) return saved
  } catch {
    // ignore
  }
  return 'focus'
}

export function WorkbenchView({ user, onOpenVault, onToast, onChanged }: Props) {
  const [tab, setTab] = useState<string>(() => getInitialTab(user.id))
  const [coreModules, setCoreModules] = useState<WorkbenchModuleItem[]>([
    {
      id: 'focus',
      kind: 'core',
      name: '今日焦点',
      description: '',
      icon: 'focus',
      enabled: true,
      removable: false,
    },
    {
      id: 'cron',
      kind: 'core',
      name: '定时任务',
      description: '',
      icon: 'clock',
      enabled: true,
      removable: false,
    },
  ])
  const [extModules, setExtModules] = useState<WorkbenchModuleItem[]>([])
  const [loadingMods, setLoadingMods] = useState(true)
  const [savingMods, setSavingMods] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)

  const loadModules = useCallback(async () => {
    setLoadingMods(true)
    try {
      const res = await api.listWorkbenchModules()
      setCoreModules(res.core)
      setExtModules(res.modules)
    } catch {
      // keep safe core fallback
    } finally {
      setLoadingMods(false)
    }
  }, [])

  useEffect(() => {
    setTab(getInitialTab(user.id))
    loadModules()
  }, [user.id, loadModules])

  const enabledExtensions = useMemo(
    () => extModules.filter((m) => m.enabled),
    [extModules],
  )

  useEffect(() => {
    if (loadingMods) return
    const validIds = new Set(['focus', 'cron', ...enabledExtensions.map((m) => m.id)])
    if (!validIds.has(tab)) {
      setTab('focus')
    }
  }, [loadingMods, enabledExtensions, tab])

  function switchTab(next: string) {
    setTab(next)
    try {
      sessionStorage.setItem(`donut_workbench_tab_${user.id}`, next)
    } catch {
      // ignore
    }
  }

  async function handleSaveModules(items: Array<{ id: string; enabled: boolean }>) {
    setSavingMods(true)
    try {
      const res = await api.saveWorkbenchModules(items)
      setCoreModules(res.core)
      setExtModules(res.modules)
      onToast('工作台扩展布局已更新')
    } catch (e) {
      onToast(e instanceof Error ? e.message : '保存扩展配置失败')
    } finally {
      setSavingMods(false)
    }
  }

  async function handleDeleteMicroApp(appId: string) {
    try {
      await api.deleteMicroApp(appId)
      await loadModules()
      if (tab === appId) switchTab('focus')
      onToast('微应用已删除')
    } catch (e) {
      onToast(e instanceof Error ? e.message : '删除微应用失败')
    }
  }

  const activeExtension = enabledExtensions.find((m) => m.id === tab) || null

  return (
    <div data-testid="workbench-page" className="chat-scroll flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-14 space-y-6">
        {/* Header + Dynamic Per-User Tab Strip */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">工作台</h1>
            <p className="text-[13.5px]" style={{ color: 'var(--text-muted)' }}>
              今日焦点、自动巡检与按需扩展的个人专属工作模块
            </p>
          </div>

          <div
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-2xl self-start lg:self-auto max-w-full"
            style={{
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {coreModules.map((m) => {
              const active = tab === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`workbench-tab-${m.id}`}
                  onClick={() => switchTab(m.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all pressable cursor-pointer"
                  style={{
                    background: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  <WorkbenchIcon name={m.icon} size={15} />
                  <span>{m.name}</span>
                </button>
              )
            })}

            {enabledExtensions.length > 0 && (
              <span
                className="h-4 w-px mx-0.5 shrink-0"
                style={{ background: 'var(--border-strong)' }}
                aria-hidden="true"
              />
            )}

            {enabledExtensions.map((m) => {
              const active = tab === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`workbench-tab-${m.id}`}
                  onClick={() => switchTab(m.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all pressable cursor-pointer"
                  style={{
                    background: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  <WorkbenchIcon name={m.icon} size={15} />
                  <span>{m.name}</span>
                </button>
              )
            })}

            <button
              type="button"
              data-testid="workbench-manage-modules-btn"
              onClick={() => setManagerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium sidebar-row pressable cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
              title="管理工作台扩展"
            >
              {loadingMods ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <SlidersHorizontal size={14} />
              )}
              <span>管理扩展</span>
            </button>
          </div>
        </div>

        {tab === 'focus' && <FocusTab onToast={onToast} />}
        {tab === 'cron' && <CronView user={user} embedded onChanged={onChanged} />}
        {tab === 'reimbursements' && activeExtension && (
          <ReimbursementTab onOpenVault={onOpenVault} onToast={onToast} />
        )}
        {activeExtension && tab !== 'reimbursements' && (
          <MicroAppHost module={activeExtension} onToast={onToast} />
        )}
      </div>

      {managerOpen && (
        <ModuleManagerModal
          core={coreModules}
          modules={extModules}
          saving={savingMods}
          onSaveModules={handleSaveModules}
          onDeleteMicroApp={handleDeleteMicroApp}
          onClose={() => setManagerOpen(false)}
        />
      )}
    </div>
  )
}
