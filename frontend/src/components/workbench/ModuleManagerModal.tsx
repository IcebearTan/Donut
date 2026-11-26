import { useState } from 'react'
import { Loader2, Lock, X } from 'lucide-react'
import type { WorkbenchModuleItem } from '../../api/client'
import { ModuleItemRow } from './ModuleItemRow'
import { WorkbenchIcon } from './iconMap'

interface Props {
  core: WorkbenchModuleItem[]
  modules: WorkbenchModuleItem[]
  saving: boolean
  onSaveModules: (items: Array<{ id: string; enabled: boolean }>) => Promise<void>
  onDeleteMicroApp?: (appId: string) => Promise<void>
  onClose: () => void
}

export function ModuleManagerModal({
  core,
  modules,
  saving,
  onSaveModules,
  onDeleteMicroApp,
  onClose,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const toggleEnabled = (id: string) =>
    onSaveModules(modules.map((m) => ({ id: m.id, enabled: m.id === id ? !m.enabled : m.enabled })))

  const moveModule = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= modules.length) return Promise.resolve()
    const copy = [...modules]
    const [moved] = copy.splice(index, 1)
    copy.splice(target, 0, moved)
    return onSaveModules(copy.map((m) => ({ id: m.id, enabled: m.enabled })))
  }

  async function handleConfirmDelete(appId: string) {
    if (!onDeleteMicroApp) return
    setDeletingId(appId)
    try {
      await onDeleteMicroApp(appId)
      setConfirmDeleteId(null)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div
      data-testid="module-manager-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
      onClick={() => !saving && !deletingId && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-3xl p-5 sm:p-6 space-y-4 animate-modal-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-[16px] font-semibold tracking-tight">工作台扩展管理</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              每个账号独立启用与排序；也可以在对话里让 Donut 帮你打造新微应用
            </p>
          </div>
          <button
            type="button"
            data-testid="close-module-manager-btn"
            onClick={onClose}
            className="p-1.5 rounded-xl sidebar-row cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          <div className="space-y-2">
            <div className="text-[11.5px] font-medium px-1" style={{ color: 'var(--text-muted)' }}>
              核心底座（默认自带）
            </div>
            <div className="space-y-1.5">
              {core.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl"
                  style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                    >
                      <WorkbenchIcon name={c.icon} size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{c.name}</div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {c.description}
                      </div>
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] shrink-0"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  >
                    <Lock size={10} />
                    <span>常驻</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11.5px] font-medium" style={{ color: 'var(--text-muted)' }}>
                可选插件与微应用（{modules.length}）
              </span>
              {saving && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
            </div>
            {modules.length === 0 ? (
              <div
                className="p-4 rounded-2xl text-xs text-center"
                style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                暂无可选扩展模块
              </div>
            ) : (
              <div className="space-y-2">
                {modules.map((mod, idx) => (
                  <ModuleItemRow
                    key={mod.id}
                    mod={mod}
                    isFirst={idx === 0}
                    isLast={idx === modules.length - 1}
                    saving={saving}
                    confirmingDelete={confirmDeleteId === mod.id}
                    deleting={deletingId === mod.id}
                    onMove={(delta) => moveModule(idx, delta)}
                    onToggle={() => toggleEnabled(mod.id)}
                    onToggleDeleteConfirm={() =>
                      setConfirmDeleteId((cur) => (cur === mod.id ? null : mod.id))
                    }
                    onConfirmDelete={onDeleteMicroApp ? () => handleConfirmDelete(mod.id) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
