import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type UserProfile, type WorkbenchModuleItem } from '../api/client'
import { CronView } from './CronView'
import { ReimbursementTab } from './ReimbursementTab'
import { FocusTab } from './workbench/FocusTab'
import { LedgerTab } from './workbench/ledger/LedgerTab'
import { PomodoroTab } from './workbench/pomodoro/PomodoroTab'
import { MicroAppHost } from './workbench/MicroAppHost'
import { ModuleManagerModal } from './workbench/ModuleManagerModal'
import { WorkbenchBreadcrumb } from './workbench/WorkbenchBreadcrumb'
import { CORE_FALLBACK } from './workbench/coreModules'
import { WorkbenchHub } from './workbench/WorkbenchHub'

interface Props {
  user: UserProfile
  onOpenVault: () => void
  onToast: (msg: string) => void
  onChanged?: () => void
  /** `null` shows the hub overview; any other value is a module id from the URL hash. */
  activeModule?: string | null
  onSelectModule?: (moduleId: string | null) => void
  onOpenQuickLedger?: () => void
  onModulesUpdated?: (modules: WorkbenchModuleItem[]) => void
}

/**
 * Two-mode shell: the hub overview (`activeModule === null`) or one immersive module
 * behind a breadcrumb. The route drives the mode when `onSelectModule` is given.
 */
export function WorkbenchView({
  user,
  onOpenVault,
  onToast,
  onChanged,
  activeModule: activeModuleProp,
  onSelectModule,
  onOpenQuickLedger,
  onModulesUpdated,
}: Props) {
  // Fallback for callers that do not route: the view remembers the module itself.
  const [localModule, setLocalModule] = useState<string | null>(null)
  const activeModule = onSelectModule
    ? activeModuleProp ?? null
    : activeModuleProp !== undefined
      ? activeModuleProp
      : localModule

  const [coreModules, setCoreModules] = useState<WorkbenchModuleItem[]>(CORE_FALLBACK)
  const [extModules, setExtModules] = useState<WorkbenchModuleItem[]>([])
  const [loadingMods, setLoadingMods] = useState(true)
  const [savingMods, setSavingMods] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)

  const select = useCallback(
    (next: string | null) => {
      if (!onSelectModule) setLocalModule(next)
      onSelectModule?.(next)
    },
    [onSelectModule],
  )

  const loadModules = useCallback(async () => {
    setLoadingMods(true)
    try {
      const res = await api.listWorkbenchModules()
      setCoreModules(res.core)
      setExtModules(res.modules)
      onModulesUpdated?.(res.modules)
    } catch {
      // keep the safe core fallback
    } finally {
      setLoadingMods(false)
    }
  }, [onModulesUpdated])

  useEffect(() => {
    loadModules()
  }, [user.id, loadModules])

  const enabledExtensions = useMemo(
    () => extModules.filter((m) => m.enabled),
    [extModules],
  )

  // A module can disappear (disabled, deleted, bad hash): land on the hub instead of a blank pane.
  useEffect(() => {
    if (loadingMods || activeModule === null) return
    const known =
      coreModules.some((m) => m.id === activeModule) || enabledExtensions.some((m) => m.id === activeModule)
    if (!known) select(null)
  }, [loadingMods, activeModule, coreModules, enabledExtensions, select])

  // Resolves only after the new layout is applied, so the manager keeps its buttons disabled meanwhile.
  async function handleSaveModules(items: Array<{ id: string; enabled: boolean }>) {
    setSavingMods(true)
    try {
      const res = await api.saveWorkbenchModules(items)
      setCoreModules(res.core)
      setExtModules(res.modules)
      onModulesUpdated?.(res.modules)
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
      onToast('微应用已删除')
    } catch (e) {
      onToast(e instanceof Error ? e.message : '删除微应用失败')
    }
  }

  function renderModule(id: string) {
    const extension = enabledExtensions.find((m) => m.id === id)
    if (id === 'focus') return <FocusTab onToast={onToast} />
    if (id === 'cron') return <CronView user={user} embedded onChanged={onChanged} />
    if (id === 'reimbursements' && extension) {
      return <ReimbursementTab onOpenVault={onOpenVault} onToast={onToast} />
    }
    if (id === 'ledger' && extension) return <LedgerTab userId={user.id} onToast={onToast} />
    if (id === 'pomodoro' && extension) return <PomodoroTab userId={user.id} onToast={onToast} />
    return extension ? <MicroAppHost module={extension} onToast={onToast} /> : null
  }

  return (
    <div data-testid="workbench-page" className="chat-scroll flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-14 space-y-6">
        {activeModule === null ? (
          <WorkbenchHub
            key="hub"
            userId={user.id}
            coreModules={coreModules}
            extModules={extModules}
            loading={loadingMods}
            onSelectModule={(id) => select(id)}
            onOpenManager={() => setManagerOpen(true)}
            onOpenQuickLedger={onOpenQuickLedger}
            onToast={onToast}
          />
        ) : (
          <>
            <WorkbenchBreadcrumb
              modules={[...coreModules, ...enabledExtensions]}
              activeId={activeModule}
              loading={loadingMods}
              onBack={() => select(null)}
              onSelect={select}
              onManage={() => setManagerOpen(true)}
            />
            <div key={activeModule} className="animate-msg-in">
              {renderModule(activeModule)}
            </div>
          </>
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
