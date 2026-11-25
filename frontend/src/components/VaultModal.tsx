import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Archive,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Inbox,
  Loader2,
  Lock,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  api,
  type SkillItem,
  type UserProfile,
  type VaultFileItem,
  type VaultFilesResponse,
} from '../api/client'

export type VaultTab = 'inbox' | 'artifacts' | 'archive' | 'skills'

interface Props {
  user: UserProfile
  initialTab?: VaultTab
  onChanged?: () => void
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatShortDate(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${min}`
}

function isImageExt(ext: string): boolean {
  return ['.webp', '.png', '.jpg', '.jpeg', '.gif'].includes(ext.toLowerCase())
}

function FileTypeBadge({ item }: { item: VaultFileItem }) {
  if (isImageExt(item.ext)) {
    return (
      <img
        src={item.url}
        alt={item.name}
        className="w-10 h-10 rounded-lg object-cover shrink-0"
        style={{ border: '1px solid var(--border-subtle)' }}
      />
    )
  }
  const ext = item.ext.toLowerCase()
  let Icon = FileText
  if (['.xlsx', '.xls', '.csv'].includes(ext)) Icon = FileSpreadsheet
  else if (ext === '.zip') Icon = FileArchive
  else if (isImageExt(ext)) Icon = ImageIcon

  return (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-secondary)',
      }}
    >
      <Icon size={18} />
    </div>
  )
}

export function VaultModal({ user, initialTab = 'artifacts', onChanged, onClose }: Props) {
  const [tab, setTab] = useState<VaultTab>(initialTab)
  const [vault, setVault] = useState<VaultFilesResponse>({ inbox: [], artifacts: [], archive: [] })
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [vRes, sRes] = await Promise.all([api.listVaultFiles(), api.listSkills()])
      setVault(vRes)
      setSkills(sRes.skills)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const f of Array.from(files).slice(0, 10)) {
        await api.uploadVaultFile(f)
      }
      setTab('inbox')
      await loadAll()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  async function handleDelete(item: VaultFileItem) {
    if (!window.confirm(`确定删除「${item.name}」吗？删除后不可恢复。`)) return
    const key = `${item.scope}:${item.path}`
    setDeletingKey(key)
    setError(null)
    try {
      await api.deleteVaultFile(item.scope, item.path)
      await loadAll()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeletingKey(null)
    }
  }

  const tabs: Array<{ id: VaultTab; label: string; count: number; icon: React.ReactNode }> = [
    { id: 'artifacts', label: '生成成品', count: vault.artifacts.length, icon: <FolderOpen size={14} /> },
    { id: 'inbox', label: '收件箱', count: vault.inbox.length, icon: <Inbox size={14} /> },
    { id: 'archive', label: '长期归档', count: vault.archive.length, icon: <Archive size={14} /> },
    { id: 'skills', label: '已掌握技能', count: skills.length, icon: <Sparkles size={14} /> },
  ]

  const activeFiles: VaultFileItem[] = tab === 'skills' ? [] : vault[tab]
  const assistantName = user.assistant_name || 'Donut'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/45 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        data-testid="vault-modal"
        className="w-full max-w-2xl max-h-[86dvh] flex flex-col rounded-2xl overflow-hidden animate-modal-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between gap-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold truncate">我的文件仓与技能</h2>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] shrink-0"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                }}
              >
                <Lock size={10} />
                <span>{user.display_name} 专属隔离仓</span>
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              你上传的文件、{assistantName} 生成的 PDF/表格、以及为你沉淀的专属技能全部独立存放
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => uploadInputRef.current?.click()}
              data-testid="vault-upload-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              <span>{uploading ? '上传中…' : '上传文件'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="p-1.5 rounded-xl sidebar-row pressable cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div
          className="px-4 py-2.5 flex items-center gap-1.5 overflow-x-auto shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)' }}
        >
          {tabs.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`vault-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap pressable cursor-pointer transition-colors"
                style={{
                  background: active ? 'var(--bg-surface)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  border: active ? '1px solid var(--border-subtle)' : '1px solid transparent',
                }}
              >
                {t.icon}
                <span>{t.label}</span>
                <span
                  className="text-[11px] px-1.5 py-0.2 rounded-full tabular-nums"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {t.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {error && (
            <div
              className="mb-3 px-3.5 py-2.5 rounded-xl text-xs"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div
              className="py-16 flex flex-col items-center justify-center gap-2 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              <Loader2 size={20} className="animate-spin" />
              <span>正在读取专属隔离仓…</span>
            </div>
          ) : tab === 'skills' ? (
            skills.length === 0 ? (
              <div
                className="py-12 px-4 text-center rounded-2xl text-xs space-y-2"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <Sparkles size={22} className="mx-auto opacity-60" />
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  还没有沉淀专属技能
                </div>
                <p className="max-w-sm mx-auto leading-relaxed">
                  遇到重复性的新需求时，直接跟 {assistantName} 说「帮我做这件事，并把它沉淀成你的专属技能」，它会自己写脚本测试并永久学会。
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {skills.map((sk) => (
                  <div
                    key={sk.id}
                    className="p-3.5 rounded-xl space-y-1.5"
                    style={{
                      background: 'var(--bg-sidebar)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <Sparkles size={13} />
                        </span>
                        <span className="text-sm font-semibold truncate">{sk.name}</span>
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-md font-mono shrink-0"
                          style={{
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {sk.id}
                        </span>
                      </div>
                      <span
                        className="text-[11px] shrink-0 tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {formatShortDate(sk.updated_at)}
                      </span>
                    </div>
                    {sk.description && (
                      <p
                        className="text-xs leading-relaxed pl-8"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {sk.description}
                      </p>
                    )}
                  </div>
                ))}
                <div
                  className="mt-3 px-3.5 py-2.5 rounded-xl text-xs leading-relaxed"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                  }}
                >
                  💡 想让 {assistantName} 学会新本领？在对话里把流程带它跑通一次，然后说「把这个流程固化成你的新技能」，它就会自动写入你专属的 <code className="font-mono">skills/</code> 目录。
                </div>
              </div>
            )
          ) : activeFiles.length === 0 ? (
            <div
              className="py-12 px-4 text-center rounded-2xl text-xs space-y-2"
              style={{
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              <FolderOpen size={22} className="mx-auto opacity-60" />
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {tab === 'inbox'
                  ? '收件箱还是空的'
                  : tab === 'artifacts'
                    ? '还没有生成成品'
                    : '还没有归档文件'}
              </div>
              <p className="max-w-sm mx-auto leading-relaxed">
                {tab === 'inbox'
                  ? '在聊天输入框点击回形针或点右上角「上传文件」，支持图片、PDF、Excel、Word、CSV 等。'
                  : tab === 'artifacts'
                    ? `让 ${assistantName} 帮你合并发票 PDF、导出 Excel 报表或生成 Word 文档后，成品会自动出现在这里。`
                    : `让 ${assistantName} 帮你按月份/主题归档发票或资料时，会自动整理进你的专属归档仓。`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeFiles.map((item) => {
                const key = `${item.scope}:${item.path}`
                const subDir = item.path.includes('/')
                  ? item.path.slice(0, item.path.lastIndexOf('/'))
                  : ''
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 p-2.5 rounded-xl"
                    style={{
                      background: 'var(--bg-sidebar)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <FileTypeBadge item={item} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div
                        className="flex items-center flex-wrap gap-2 text-[11px] mt-0.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {subDir && (
                          <span
                            className="px-1.5 py-0.2 rounded font-mono"
                            style={{ background: 'var(--bg-elevated)' }}
                          >
                            {subDir}
                          </span>
                        )}
                        <span className="tabular-nums">{formatBytes(item.size)}</span>
                        <span>·</span>
                        <span className="tabular-nums">{formatShortDate(item.updated_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={item.url}
                        download={item.name}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium no-underline pressable"
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <Download size={12} />
                        <span className="hidden sm:inline">下载</span>
                      </a>
                      {!item.url.startsWith('/portal-api/files/') && (
                        <button
                          type="button"
                          disabled={deletingKey === key}
                          onClick={() => handleDelete(item)}
                          title="删除文件"
                          className="p-1.5 rounded-lg sidebar-row pressable cursor-pointer disabled:opacity-40"
                          style={{ color: 'var(--danger)' }}
                        >
                          {deletingKey === key ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
