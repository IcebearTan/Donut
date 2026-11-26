import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Download,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Inbox,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  api,
  type UserProfile,
  type VaultFileItem,
  type VaultFilesResponse,
} from '../api/client'

type ScopeFilter = 'all' | 'artifacts' | 'inbox' | 'archive'

interface Props {
  user: UserProfile
  onChanged?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${mm}-${dd} ${hh}:${min}`
}

function isImageExt(ext: string): boolean {
  return ['.webp', '.png', '.jpg', '.jpeg', '.gif'].includes(ext.toLowerCase())
}

function scopeLabel(scope: VaultFileItem['scope']): string {
  if (scope === 'artifacts') return '生成成品'
  if (scope === 'inbox') return '收件箱'
  return '长期归档'
}

function FileIcon({ item }: { item: VaultFileItem }) {
  if (isImageExt(item.ext)) {
    return (
      <img
        src={item.url}
        alt={item.name}
        loading="lazy"
        className="w-11 h-11 rounded-xl object-cover shrink-0"
        style={{ border: '1px solid var(--border-subtle)' }}
      />
    )
  }
  const ext = item.ext.toLowerCase()
  let Icon = FileText
  if (['.xlsx', '.xls', '.csv'].includes(ext)) Icon = FileSpreadsheet
  else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) Icon = FileArchive
  else if (['.py', '.js', '.ts', '.tsx', '.json', '.md', '.html', '.css'].includes(ext))
    Icon = FileCode
  else if (isImageExt(ext)) Icon = ImageIcon

  return (
    <div
      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-secondary)',
      }}
    >
      <Icon size={20} />
    </div>
  )
}

export function VaultView({ user, onChanged }: Props) {
  const [data, setData] = useState<VaultFilesResponse>({
    inbox: [],
    artifacts: [],
    archive: [],
    archive_folders: [],
    total_size: 0,
  })
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<VaultFileItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const assistantName = user.assistant_name || 'Donut'

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.listVaultFiles()
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载文件仓失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  async function handleUploadFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const f of Array.from(files).slice(0, 10)) {
        await api.uploadVaultFile(f)
      }
      await loadFiles()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    setError(null)
    try {
      await api.deleteVaultFile(confirmDelete.scope, confirmDelete.path)
      setConfirmDelete(null)
      await loadFiles()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const allFiles = useMemo(() => {
    const combined = [...data.artifacts, ...data.inbox, ...data.archive]
    combined.sort((a, b) => b.updated_at - a.updated_at)
    return combined
  }, [data])

  const archiveFolders = data.archive_folders || []

  const filteredFiles = useMemo(() => {
    const base =
      scope === 'all'
        ? allFiles
        : scope === 'artifacts'
          ? data.artifacts
          : scope === 'inbox'
            ? data.inbox
            : data.archive

    const q = query.trim().toLowerCase()
    return base.filter((f) => {
      if (scope === 'archive' && selectedFolder) {
        if (!f.path.startsWith(`${selectedFolder}/`)) return false
      }
      if (!q) return true
      return f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    })
  }, [allFiles, data, scope, selectedFolder, query])

  const tabs: Array<{ id: ScopeFilter; label: string; count: number; icon: React.ReactNode }> = [
    { id: 'all', label: '全部文件', count: allFiles.length, icon: <FolderOpen size={14} /> },
    { id: 'artifacts', label: '生成成品', count: data.artifacts.length, icon: <FileText size={14} /> },
    { id: 'inbox', label: '收件箱', count: data.inbox.length, icon: <Inbox size={14} /> },
    { id: 'archive', label: '长期归档', count: data.archive.length, icon: <Archive size={14} /> },
  ]

  return (
    <div
      data-testid="vault-page"
      className="chat-scroll flex-1 min-h-0 overflow-y-auto"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files?.length) handleUploadFiles(e.dataTransfer.files)
      }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-12 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">我的文件仓</h1>
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Lock size={11} />
                <span>{user.display_name} 专属隔离仓</span>
              </span>
            </div>
            <p className="text-[13.5px]" style={{ color: 'var(--text-muted)' }}>
              集中管理你上传的附件、{assistantName} 生成的文档成品，以及按项目归档的长期资料（支持单文件最高 500MB）
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={loadFiles}
              title="刷新"
              className="w-10 h-10 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => uploadInputRef.current?.click()}
              data-testid="vault-page-upload-btn"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium pressable cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              <span>{uploading ? '上传中…' : '上传文件'}</span>
            </button>
          </div>
        </div>

        {/* Drag overlay hint */}
        {dragging && (
          <div
            className="rounded-2xl p-6 text-center text-sm font-medium border-2 border-dashed animate-msg-in"
            style={{
              borderColor: 'var(--accent)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
            }}
          >
            松开鼠标即可上传到你的专属收件箱（inbox）
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            className="p-4 rounded-2xl"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              文件总数
            </div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{allFiles.length}</div>
          </div>
          <div
            className="p-4 rounded-2xl"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              占用空间
            </div>
            <div className="text-xl font-semibold mt-1 tabular-nums">
              {formatBytes(data.total_size || 0)}
            </div>
          </div>
          <div
            className="p-4 rounded-2xl"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              生成成品
            </div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{data.artifacts.length}</div>
          </div>
          <div
            className="p-4 rounded-2xl"
            style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              归档目录
            </div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{archiveFolders.length}</div>
          </div>
        </div>

        {/* Scope Tabs + Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div
            className="inline-flex items-center gap-1 p-1 rounded-2xl overflow-x-auto"
            style={{
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {tabs.map((t) => {
              const active = scope === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`vault-scope-${t.id}`}
                  onClick={() => {
                    setScope(t.id)
                    setSelectedFolder('')
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap pressable cursor-pointer transition-colors"
                  style={{
                    background: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                  <span
                    className="text-[11px] px-1.5 py-0.2 rounded-full tabular-nums"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  >
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>

          <div
            className="flex items-center gap-2 px-3.5 py-2 rounded-full sm:w-64"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索文件名或目录…"
              className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px]"
              style={{ color: 'var(--text-primary)' }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Archive Directory Tree Pills (shown in archive or all when folders exist) */}
        {archiveFolders.length > 0 && (scope === 'archive' || scope === 'all') && (
          <div
            data-testid="vault-archive-folders"
            className="p-4 rounded-2xl space-y-2.5"
            style={{
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <Folder size={13} />
                <span>归档目录结构（`vault/archive/`）</span>
              </span>
              {selectedFolder && (
                <button
                  type="button"
                  onClick={() => setSelectedFolder('')}
                  className="text-xs underline cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  清除筛选
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {archiveFolders.map((folder) => {
                const active = scope === 'archive' && selectedFolder === folder
                return (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => {
                      setScope('archive')
                      setSelectedFolder(active ? '' : folder)
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs sidebar-row pressable cursor-pointer"
                    style={{
                      background: active ? 'var(--accent)' : 'var(--bg-surface)',
                      color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    <Folder size={12} className="opacity-75 shrink-0" />
                    <span>{folder}</span>
                  </button>
                )
              })}
            </div>
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

        {/* File List */}
        {loading ? (
          <div
            className="py-20 flex flex-col items-center justify-center gap-2.5 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <Loader2 size={22} className="animate-spin" />
            <span>正在读取你的专属文件仓…</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div
            className="py-16 px-6 text-center rounded-3xl space-y-2.5"
            style={{
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <FolderOpen size={28} className="mx-auto opacity-55" />
            <div className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {query
                ? '没有找到匹配的文件'
                : selectedFolder
                  ? `目录「${selectedFolder}」里暂时还没有文件`
                  : '这里还是空的'}
            </div>
            <p className="text-xs max-w-md mx-auto leading-relaxed">
              你可以直接把文件拖拽到这里上传，或者在聊天里发给 {assistantName}，让它帮你整理、生成成品或归档到对应项目目录。
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFiles.map((item) => {
              const subDir = item.path.includes('/')
                ? item.path.slice(0, item.path.lastIndexOf('/'))
                : ''
              return (
                <div
                  key={`${item.scope}:${item.path}`}
                  className="flex items-center gap-3.5 p-3.5 rounded-2xl transition-colors"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <FileIcon item={item} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-medium truncate">{item.name}</div>
                    <div
                      className="flex items-center flex-wrap gap-2 text-xs mt-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px]"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                      >
                        {scopeLabel(item.scope)}
                      </span>
                      {subDir && (
                        <span
                          className="px-2 py-0.5 rounded-md font-mono text-[11px]"
                          style={{ background: 'var(--bg-sidebar)' }}
                        >
                          {subDir}
                        </span>
                      )}
                      <span className="tabular-nums">{formatBytes(item.size)}</span>
                      <span>·</span>
                      <span className="tabular-nums">{formatDate(item.updated_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={item.url}
                      download={item.name}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium no-underline sidebar-row pressable"
                      style={{
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Download size={13} />
                      <span className="hidden sm:inline">下载</span>
                    </a>
                    {!item.url.startsWith('/portal-api/files/') && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(item)}
                        title="删除文件"
                        className="p-2 rounded-xl sidebar-row pressable cursor-pointer"
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Calm in-app Delete Confirmation Modal */}
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
              <h3 className="text-[16px] font-semibold">删除这个文件？</h3>
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                将永久删除「<span className="font-medium" style={{ color: 'var(--text-primary)' }}>{confirmDelete.name}</span>」，删除后无法恢复。
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
