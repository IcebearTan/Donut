import { useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Lock, Trash2, X } from 'lucide-react'
import type { WorkbenchModuleItem } from '../../api/client'
import { WorkbenchIcon } from './iconMap'

interface Props {
  core: WorkbenchModuleItem[]
  modules: WorkbenchModuleItem[]
  saving: boolean
  onSaveModules: (items: Array<{ id: string; enabled: boolean }>) => Promise<void>
  onDeleteMicroApp?: (appId: string) => Promise<void>
  onClose: () => void
}

function kindLabel(mod: WorkbenchModuleItem): string {
  if (mod.kind === 'builtin') return '内置精选'
  if (mod.kind === 'html') return 'HTML 沙箱'
  if (mod.template) return `模板 · ${mod.template}`
  return '微应用'
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

  async function toggleEnabled(id: string) {
    const next = modules.map((m) => ({
      id: m.id,
      enabled: m.id === id ? !m.enabled : m.enabled,
    }))
    await onSaveModules(next)
  }

  async function moveModule(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= modules.length) return
    const copy = [...modules]
    const [moved] = copy.splice(index, 1)
    copy.splice(target, 0, moved)
    await onSaveModules(copy.map((m) => ({ id: m.id, enabled: m.enabled })))
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
          {/* Core Built-in Modules */}
          <div className="space-y-2">
            <div className="text-[11.5px] font-medium px-1" style={{ color: 'var(--text-muted)' }}>
              核心底座（默认自带）
            </div>
            <div className="space-y-1.5">
              {core.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-subtle)',
                  }}
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

          {/* Optional Extensions & Micro-Apps */}
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
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                暂无可选扩展模块
              </div>
            ) : (
              <div className="space-y-2">
                {modules.map((mod, idx) => (
                  <div
                    key={mod.id}
                    data-testid={`module-row-${mod.id}`}
                    className="rounded-2xl p-3.5 space-y-2"
                    style={{
                      background: 'var(--bg-sidebar)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            color: mod.enabled ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}
                        >
                          <WorkbenchIcon name={mod.icon} size={16} />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[13.5px] font-semibold truncate">{mod.name}</span>
                            <span
                              className="px-2 py-0.5 rounded-full text-[10.5px] shrink-0"
                              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                            >
                              {kindLabel(mod)}
                            </span>
                          </div>
                          {mod.description && (
                            <p className="text-[11.5px] truncate" style={{ color: 'var(--text-muted)' }}>
                              {mod.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={saving || idx === 0}
                          onClick={() => moveModule(idx, -1)}
                          title="上移"
                          data-testid={`module-up-${mod.id}`}
                          className="p-1.5 rounded-lg sidebar-row cursor-pointer disabled:opacity-30"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={saving || idx === modules.length - 1}
                          onClick={() => moveModule(idx, 1)}
                          title="下移"
                          data-testid={`module-down-${mod.id}`}
                          className="p-1.5 rounded-lg sidebar-row cursor-pointer disabled:opacity-30"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <ArrowDown size={13} />
                        </button>

                        {mod.removable && onDeleteMicroApp && (
                          <button
                            type="button"
                            disabled={saving || deletingId === mod.id}
                            onClick={() =>
                              setConfirmDeleteId((cur) => (cur === mod.id ? null : mod.id))
                            }
                            title="删除微应用"
                            data-testid={`module-delete-${mod.id}`}
                            className="p-1.5 rounded-lg sidebar-row cursor-pointer disabled:opacity-30"
                            style={{ color: 'var(--danger)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}

                        <button
                          type="button"
                          role="switch"
                          aria-checked={mod.enabled}
                          disabled={saving}
                          data-testid={`module-toggle-${mod.id}`}
                          onClick={() => toggleEnabled(mod.id)}
                          className="w-10 h-5.5 rounded-full p-0.5 transition-colors cursor-pointer disabled:opacity-50 relative"
                          style={{
                            background: mod.enabled ? 'var(--accent)' : 'var(--border-strong)',
                          }}
                        >
                          <span
                            className="block w-4.5 h-4.5 rounded-full transition-transform"
                            style={{
                              background: mod.enabled ? 'var(--accent-contrast)' : 'var(--bg-surface)',
                              transform: mod.enabled ? 'translateX(18px)' : 'translateX(0)',
                            }}
                          />
                        </button>
                      </div>
                    </div>

                    {confirmDeleteId === mod.id && (
                      <div
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs"
                        style={{
                          background: 'rgba(220,38,38,0.08)',
                          border: '1px solid rgba(220,38,38,0.2)',
                        }}
                      >
                        <span style={{ color: 'var(--danger)' }}>
                          确认删除微应用「{mod.name}」及其数据？
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1 rounded-lg text-[11px] cursor-pointer"
                            style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            data-testid={`module-confirm-delete-${mod.id}`}
                            disabled={deletingId === mod.id}
                            onClick={() => handleConfirmDelete(mod.id)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer disabled:opacity-50"
                            style={{ background: 'var(--danger)', color: '#fff' }}
                          >
                            {deletingId === mod.id ? '删除中…' : '确认删除'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
