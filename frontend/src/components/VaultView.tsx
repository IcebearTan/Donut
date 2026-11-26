import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  ChevronRight,
  Download,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  Inbox,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  api,
  type UserProfile,
  type VaultBrowseResponse,
  type VaultFileItem,
  type VaultFolderItem,
} from '../api/client'

type VaultScope = 'archive' | 'artifacts' | 'inbox'
type ViewMode = 'list' | 'grid'

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

function scopeLabel(scope: VaultScope): string {
  if (scope === 'artifacts') return '生成成品'
  if (scope === 'inbox') return '收件箱'
  return '长期归档'
}

function parentDirOf(dir: string): string {
  if (!dir) return ''
  const idx = dir.lastIndexOf('/')
  return idx >= 0 ? dir.slice(0, idx) : ''
}

function FileThumbnail({ item, size = 'sm' }: { item: VaultFileItem; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'
  if (isImageExt(item.ext)) {
    return (
      <img
        src={item.url}
        alt={item.name}
        loading="lazy"
        className={`${dim} rounded-xl object-cover shrink-0`}
        style={{ border: '1px solid var(--border-subtle)' }}
      />
    )
  }
  const ext = item.ext.toLowerCase()
  let Icon = FileText
  if (['.xlsx', '.xls', '.csv'].includes(ext)) Icon = FileSpreadsheet
  else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) Icon = FileArchive
  else if (['.py', '.js', '.ts', '.tsx', '.json', '.md', '.html', '.css', '.sh'].includes(ext))
    Icon = FileCode
  else if (isImageExt(ext)) Icon = ImageIcon

  return (
    <div
      className={`${dim} rounded-xl flex items-center justify-center shrink-0`}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-secondary)',
      }}
    >
      <Icon size={size === 'lg' ? 22 : 18} />
    </div>
  )
}

export function VaultView({ user, onChanged }: Props) {
  const [scope, setScope] = useState<VaultScope>('archive')
  const [dir, setDir] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [browseData, setBrowseData] = useState<VaultBrowseResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Global search across all scopes
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<{
    files: VaultFileItem[]
    folders: VaultFolderItem[]
  } | null>(null)

  // Upload & drag-drop directly into current (scope, dir)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  // Create folder modal
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  // Move / Rename file modal
  const [moveTarget, setMoveTarget] = useState<VaultFileItem | null>(null)
  const [moveScope, setMoveScope] = useState<VaultScope>('archive')
  const [moveDir, setMoveDir] = useState('')
  const [moveNewName, setMoveNewName] = useState('')
  const [moving, setMoving] = useState(false)

  // Delete confirmation modal (file or empty folder)
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<VaultFileItem | null>(null)
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<VaultFolderItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const assistantName = user.assistant_name || 'Donut'
  const trimmedQuery = query.trim()

  const loadDirectory = useCallback(async (targetScope: VaultScope, targetDir: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.browseVault(targetScope, targetDir)
      setBrowseData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载目录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDirectory(scope, dir)
  }, [loadDirectory, scope, dir])

  // Debounced global search
  useEffect(() => {
    if (!trimmedQuery) {
      setSearchResult(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.searchVault(trimmedQuery)
        if (!cancelled) setSearchResult(res)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '搜索失败')
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmedQuery])

  function navigateTo(nextScope: VaultScope, nextDir = '') {
    setQuery('')
    setSearchResult(null)
    setScope(nextScope)
    setDir(nextDir)
  }

  async function refreshCurrent() {
    await loadDirectory(scope, dir)
    if (trimmedQuery) {
      try {
        const res = await api.searchVault(trimmedQuery)
        setSearchResult(res)
      } catch {
        // ignore
      }
    }
  }

  async function handleUploadFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const f of Array.from(files).slice(0, 10)) {
        await api.uploadVaultFile(f, { scope, dir })
      }
      await refreshCurrent()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault()
    const clean = newFolderName.trim()
    if (!clean) return
    setCreatingFolder(true)
    setError(null)
    try {
      await api.createVaultFolder(scope, dir, clean)
      setMkdirOpen(false)
      setNewFolderName('')
      await refreshCurrent()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建文件夹失败')
    } finally {
      setCreatingFolder(false)
    }
  }

  function openMoveModal(item: VaultFileItem) {
    setMoveTarget(item)
    setMoveScope(item.scope)
    setMoveDir(parentDirOf(item.path))
    setMoveNewName(item.name)
  }

  async function handleConfirmMove(e: React.FormEvent) {
    e.preventDefault()
    if (!moveTarget) return
    setMoving(true)
    setError(null)
    try {
      await api.moveVaultFile({
        from_scope: moveTarget.scope,
        from_path: moveTarget.path,
        to_scope: moveScope,
        to_dir: moveDir.trim(),
        new_name: moveNewName.trim() || moveTarget.name,
      })
      setMoveTarget(null)
      await refreshCurrent()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '移动或重命名失败')
    } finally {
      setMoving(false)
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true)
    setError(null)
    try {
      if (confirmDeleteFile) {
        await api.deleteVaultFile(confirmDeleteFile.scope, confirmDeleteFile.path)
        setConfirmDeleteFile(null)
      } else if (confirmDeleteFolder) {
        await api.deleteVaultFolder(confirmDeleteFolder.scope, confirmDeleteFolder.path)
        setConfirmDeleteFolder(null)
      }
      await refreshCurrent()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const summary = browseData?.summary
  const archiveCategories = summary?.archive_categories || []
  const counts = summary?.counts || { archive: 0, artifacts: 0, inbox: 0 }
  const folders = trimmedQuery ? searchResult?.folders || [] : browseData?.folders || []
  const files = trimmedQuery ? searchResult?.files || [] : browseData?.files || []
  const breadcrumbs = browseData?.breadcrumbs || [{ name: scopeLabel(scope), dir: '' }]

  const spaces: Array<{
    id: VaultScope
    label: string
    desc: string
    count: number
    icon: React.ReactNode
  }> = [
    {
      id: 'archive',
      label: '长期归档',
      desc: '按主题分类整理',
      count: counts.archive,
      icon: <Archive size={15} />,
    },
    {
      id: 'artifacts',
      label: '生成成品',
      desc: `${assistantName} 输出文档`,
      count: counts.artifacts,
      icon: <Sparkles size={15} />,
    },
    {
      id: 'inbox',
      label: '收件箱',
      desc: '对话附件与待整理',
      count: counts.inbox,
      icon: <Inbox size={15} />,
    },
  ]

  const currentLocationLabel = dir ? `${scopeLabel(scope)} / ${dir}` : scopeLabel(scope)

  return (
    <div
      data-testid="vault-page"
      className="chat-scroll flex-1 min-h-0 overflow-y-auto"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files?.length) handleUploadFiles(e.dataTransfer.files)
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-12 space-y-5">
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
              按目录分层管理资料、新建文件夹与归档移动，单文件最高支持 500MB
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={refreshCurrent}
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
              data-testid="vault-new-folder-btn"
              onClick={() => {
                setNewFolderName('')
                setMkdirOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <FolderPlus size={14} />
              <span>新建文件夹</span>
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => uploadInputRef.current?.click()}
              data-testid="vault-page-upload-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium pressable cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              <span>{uploading ? '上传中…' : '上传到此目录'}</span>
            </button>
          </div>
        </div>

        {/* Drag overlay hint */}
        {dragging && (
          <div
            className="rounded-2xl p-5 text-center text-sm font-medium border-2 border-dashed animate-msg-in"
            style={{
              borderColor: 'var(--accent)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
            }}
          >
            松开鼠标，文件将直接上传到「{currentLocationLabel}」
          </div>
        )}

        {/* Mobile Space Switcher */}
        <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1">
          {spaces.map((s) => {
            const active = !trimmedQuery && scope === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => navigateTo(s.id, '')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap pressable cursor-pointer"
                style={{
                  background: active ? 'var(--accent)' : 'var(--bg-sidebar)',
                  color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                }}
              >
                {s.icon}
                <span>{s.label}</span>
                <span className="opacity-75 tabular-nums">{s.count}</span>
              </button>
            )
          })}
        </div>

        {/* Dual-Pane Finder Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Space & Category Rail (Desktop) */}
          <aside className="hidden lg:flex lg:col-span-3 flex-col gap-4 sticky top-6">
            <div
              className="p-2.5 rounded-2xl space-y-1"
              style={{
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                存储分区
              </div>
              {spaces.map((s) => {
                const active = !trimmedQuery && scope === s.id && (s.id !== 'archive' || dir === '')
                const isCurrentScope = !trimmedQuery && scope === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`vault-scope-${s.id}`}
                    onClick={() => navigateTo(s.id, '')}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left sidebar-row pressable cursor-pointer"
                    style={{
                      background: active ? 'var(--bg-surface)' : 'transparent',
                      color: isCurrentScope ? 'var(--text-primary)' : 'var(--text-secondary)',
                      boxShadow: active ? 'var(--shadow-sm)' : 'none',
                    }}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="opacity-80 shrink-0">{s.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium truncate">{s.label}</span>
                        <span
                          className="block text-[11px] truncate"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {s.desc}
                        </span>
                      </span>
                    </span>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full tabular-nums shrink-0"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                    >
                      {s.count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Quick-Jump Top-Level Archive Categories */}
            {archiveCategories.length > 0 && (
              <div
                className="p-2.5 rounded-2xl space-y-1"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  归档目录直达
                </div>
                {archiveCategories.map((cat) => {
                  const active =
                    !trimmedQuery &&
                    scope === 'archive' &&
                    (dir === cat.path || dir.startsWith(`${cat.path}/`))
                  return (
                    <button
                      key={cat.path}
                      type="button"
                      onClick={() => navigateTo('archive', cat.path)}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] text-left sidebar-row pressable cursor-pointer"
                      style={{
                        background: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        boxShadow: active ? 'var(--shadow-sm)' : 'none',
                      }}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Folder size={14} className="shrink-0 opacity-75" />
                        <span className="truncate font-medium">{cat.name}</span>
                      </span>
                      <span
                        className="text-[11px] tabular-nums shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {cat.file_count}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Storage Summary Card */}
            <div
              className="p-3.5 rounded-2xl space-y-2"
              style={{
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                className="flex items-center gap-2 text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                <HardDrive size={13} />
                <span>空间概览</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-semibold tabular-nums">
                  {formatBytes(summary?.total_size || 0)}
                </span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  共 {summary?.total_files || 0} 个文件
                </span>
              </div>
            </div>
          </aside>

          {/* Right Main Finder Canvas */}
          <main className="lg:col-span-9 space-y-4 min-w-0">
            {/* Toolbar: Breadcrumbs + Global Search + View Toggle */}
            <div
              className="p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Left: Back + Breadcrumbs */}
              <div
                data-testid="vault-breadcrumbs"
                className="flex items-center gap-1 min-w-0 overflow-x-auto"
              >
                {trimmedQuery ? (
                  <div className="flex items-center gap-2 px-1 text-[13.5px] font-medium">
                    <Search size={14} style={{ color: 'var(--text-muted)' }} />
                    <span>全局搜索「{trimmedQuery}」</span>
                  </div>
                ) : (
                  <>
                    {dir && (
                      <button
                        type="button"
                        onClick={() => setDir(parentDirOf(dir))}
                        title="返回上一级"
                        className="w-7 h-7 rounded-lg flex items-center justify-center sidebar-row pressable cursor-pointer shrink-0 mr-1"
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <ArrowLeft size={13} />
                      </button>
                    )}
                    {breadcrumbs.map((crumb, idx) => {
                      const isLast = idx === breadcrumbs.length - 1
                      return (
                        <div key={`${crumb.dir}:${idx}`} className="flex items-center gap-1 shrink-0">
                          {idx > 0 && (
                            <ChevronRight
                              size={13}
                              className="opacity-45 shrink-0"
                              style={{ color: 'var(--text-muted)' }}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => setDir(crumb.dir)}
                            className={`px-2 py-1 rounded-lg text-[13px] whitespace-nowrap cursor-pointer transition-colors ${
                              isLast ? 'font-semibold' : 'sidebar-row'
                            }`}
                            style={{
                              color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)',
                              background: isLast ? 'var(--bg-surface)' : 'transparent',
                            }}
                          >
                            {crumb.name}
                          </button>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>

              {/* Right: Search + View Mode */}
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full flex-1 sm:w-56"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <Search size={13} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="全局搜索文件或文件夹…"
                    data-testid="vault-search-input"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[13px]"
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

                <div
                  className="inline-flex items-center p-0.5 rounded-xl shrink-0"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    title="列表视图"
                    className="p-1.5 rounded-lg cursor-pointer"
                    style={{
                      background: viewMode === 'list' ? 'var(--bg-elevated)' : 'transparent',
                      color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    <List size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    title="网格视图"
                    className="p-1.5 rounded-lg cursor-pointer"
                    style={{
                      background: viewMode === 'grid' ? 'var(--bg-elevated)' : 'transparent',
                      color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    <LayoutGrid size={14} />
                  </button>
                </div>
              </div>
            </div>

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

            {/* Main Directory Content */}
            {loading || searching ? (
              <div
                className="py-20 flex flex-col items-center justify-center gap-2.5 text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                <Loader2 size={20} className="animate-spin" />
                <span>{searching ? '正在搜索整个文件仓…' : '正在读取目录…'}</span>
              </div>
            ) : folders.length === 0 && files.length === 0 ? (
              <div
                className="py-16 px-6 text-center rounded-3xl space-y-2.5"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <FolderOpen size={28} className="mx-auto opacity-50" />
                <div className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  {trimmedQuery ? `没有找到包含「${trimmedQuery}」的文件或目录` : '这个目录目前是空的'}
                </div>
                <p className="text-xs max-w-md mx-auto leading-relaxed">
                  {trimmedQuery
                    ? '可以试试更短的关键词，或清空搜索按目录浏览。'
                    : `直接把文件拖拽到这里即可上传至「${currentLocationLabel}」，也可以点右上角新建子文件夹。`}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Subfolders Grid */}
                {folders.length > 0 && (
                  <section className="space-y-2.5">
                    <div
                      className="flex items-center justify-between px-1 text-xs font-medium"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span>文件夹（{folders.length}）</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {folders.map((folder) => (
                        <div
                          key={`${folder.scope}:${folder.path}`}
                          data-testid="vault-folder-card"
                          onClick={() => navigateTo(folder.scope, folder.path)}
                          className="group flex items-center gap-3 p-3.5 rounded-2xl cursor-pointer sidebar-row pressable transition-all"
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              background: 'var(--bg-elevated)',
                              color: '#d97706',
                            }}
                          >
                            <Folder size={19} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-medium truncate">{folder.name}</div>
                            <div
                              className="text-[11.5px] mt-0.5 flex items-center gap-1.5 truncate tabular-nums"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {trimmedQuery && (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[10px]"
                                  style={{ background: 'var(--bg-elevated)' }}
                                >
                                  {scopeLabel(folder.scope)}
                                </span>
                              )}
                              <span>{folder.file_count} 个文件</span>
                              {folder.size > 0 && (
                                <>
                                  <span>·</span>
                                  <span>{formatBytes(folder.size)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {folder.file_count === 0 ? (
                            <button
                              type="button"
                              title="删除空文件夹"
                              onClick={(e) => {
                                e.stopPropagation()
                                setConfirmDeleteFolder(folder)
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg pressable cursor-pointer transition-opacity shrink-0"
                              style={{ color: 'var(--danger)' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : (
                            <ChevronRight
                              size={15}
                              className="opacity-35 group-hover:opacity-80 shrink-0 transition-opacity"
                              style={{ color: 'var(--text-muted)' }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Files List or Grid */}
                {files.length > 0 && (
                  <section className="space-y-2.5">
                    <div
                      className="flex items-center justify-between px-1 text-xs font-medium"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span>文件（{files.length}）</span>
                    </div>

                    {viewMode === 'list' ? (
                      <div className="space-y-2">
                        {files.map((item) => {
                          const subDir = parentDirOf(item.path)
                          const extLabel = item.ext ? item.ext.replace(/^\./, '').toUpperCase() : ''
                          return (
                            <div
                              key={`${item.scope}:${item.path}`}
                              data-testid="vault-file-row"
                              className="flex items-center gap-3 p-3 rounded-2xl transition-colors"
                              style={{
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              <FileThumbnail item={item} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[14px] font-medium truncate">{item.name}</span>
                                  {extLabel && (
                                    <span
                                      className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                                      style={{
                                        background: 'var(--bg-elevated)',
                                        color: 'var(--text-muted)',
                                      }}
                                    >
                                      {extLabel}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="flex items-center flex-wrap gap-2 text-[11.5px] mt-1"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  {trimmedQuery && (
                                    <button
                                      type="button"
                                      onClick={() => navigateTo(item.scope, subDir)}
                                      className="px-1.5 py-0.5 rounded-md text-[11px] hover:underline cursor-pointer"
                                      style={{
                                        background: 'var(--bg-elevated)',
                                        color: 'var(--text-secondary)',
                                      }}
                                    >
                                      {scopeLabel(item.scope)}
                                      {subDir ? ` / ${subDir}` : ''}
                                    </button>
                                  )}
                                  <span className="tabular-nums">{formatBytes(item.size)}</span>
                                  <span>·</span>
                                  <span className="tabular-nums">{formatDate(item.updated_at)}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <a
                                  href={item.url}
                                  download={item.name}
                                  title="下载"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium no-underline sidebar-row pressable"
                                  style={{
                                    background: 'var(--bg-elevated)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  <Download size={13} />
                                  <span className="hidden sm:inline">下载</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() => openMoveModal(item)}
                                  title="移动或重命名"
                                  className="p-2 rounded-xl sidebar-row pressable cursor-pointer"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  <FolderInput size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteFile(item)}
                                  title="删除文件"
                                  className="p-2 rounded-xl sidebar-row pressable cursor-pointer"
                                  style={{ color: 'var(--danger)' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {files.map((item) => {
                          const subDir = parentDirOf(item.path)
                          return (
                            <div
                              key={`${item.scope}:${item.path}`}
                              data-testid="vault-file-card"
                              className="flex flex-col justify-between gap-3 p-3.5 rounded-2xl"
                              style={{
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <FileThumbnail item={item} size="lg" />
                                <div className="flex-1 min-w-0">
                                  <div
                                    className="text-[13.5px] font-medium leading-snug break-all line-clamp-2"
                                    title={item.name}
                                  >
                                    {item.name}
                                  </div>
                                  <div
                                    className="text-[11px] mt-1 tabular-nums"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    {formatBytes(item.size)} · {formatDate(item.updated_at).slice(0, 10)}
                                  </div>
                                  {trimmedQuery && (
                                    <button
                                      type="button"
                                      onClick={() => navigateTo(item.scope, subDir)}
                                      className="mt-1 text-[11px] truncate max-w-full hover:underline cursor-pointer block"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      {scopeLabel(item.scope)}
                                      {subDir ? ` / ${subDir}` : ''}
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div
                                className="flex items-center justify-end gap-1 pt-2"
                                style={{ borderTop: '1px solid var(--border-subtle)' }}
                              >
                                <a
                                  href={item.url}
                                  download={item.name}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium no-underline sidebar-row pressable"
                                  style={{
                                    background: 'var(--bg-elevated)',
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  <Download size={12} />
                                  <span>下载</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() => openMoveModal(item)}
                                  title="移动或重命名"
                                  className="p-1.5 rounded-lg sidebar-row pressable cursor-pointer"
                                  style={{ color: 'var(--text-secondary)' }}
                                >
                                  <FolderInput size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteFile(item)}
                                  title="删除文件"
                                  className="p-1.5 rounded-lg sidebar-row pressable cursor-pointer"
                                  style={{ color: 'var(--danger)' }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* New Folder Modal */}
      {mkdirOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
          onClick={() => !creatingFolder && setMkdirOpen(false)}
        >
          <form
            onSubmit={handleCreateFolder}
            className="w-full max-w-sm rounded-2xl p-5 space-y-4 animate-modal-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-[16px] font-semibold">新建文件夹</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                位置：{currentLocationLabel}
              </p>
            </div>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="输入文件夹名称（如：2026-12 或 报销材料）"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-strong)',
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={creatingFolder}
                onClick={() => setMkdirOpen(false)}
                className="px-4 py-2 rounded-xl text-[13.5px] font-medium sidebar-row pressable cursor-pointer"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creatingFolder || !newFolderName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13.5px] font-medium pressable cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
              >
                {creatingFolder && <Loader2 size={14} className="animate-spin" />}
                <span>创建</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Move / Rename File Modal */}
      {moveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
          onClick={() => !moving && setMoveTarget(null)}
        >
          <form
            onSubmit={handleConfirmMove}
            className="w-full max-w-md rounded-2xl p-5 space-y-4 animate-modal-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h3 className="text-[16px] font-semibold">移动 / 重命名文件</h3>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                当前：{scopeLabel(moveTarget.scope)} / {moveTarget.path}
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  目标分区
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['archive', 'artifacts', 'inbox'] as VaultScope[]).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => {
                        setMoveScope(sc)
                        if (sc !== 'archive') setMoveDir('')
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-medium pressable cursor-pointer"
                      style={{
                        background: moveScope === sc ? 'var(--accent)' : 'var(--bg-elevated)',
                        color: moveScope === sc ? 'var(--accent-contrast)' : 'var(--text-primary)',
                      }}
                    >
                      {scopeLabel(sc)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  目标子目录（留空则放根目录，不存在会自动创建）
                </label>
                <input
                  value={moveDir}
                  onChange={(e) => setMoveDir(e.target.value)}
                  placeholder="例如：课程/毕业设计 或 invoices/2026-11"
                  className="w-full px-3.5 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
                {moveScope === 'archive' && archiveCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {archiveCategories.map((cat) => (
                      <button
                        key={cat.path}
                        type="button"
                        onClick={() => setMoveDir(cat.path)}
                        className="px-2 py-0.5 rounded-lg text-[11px] sidebar-row cursor-pointer"
                        style={{
                          background: moveDir === cat.path ? 'var(--accent)' : 'var(--bg-sidebar)',
                          color:
                            moveDir === cat.path ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  文件名
                </label>
                <input
                  value={moveNewName}
                  onChange={(e) => setMoveNewName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={moving}
                onClick={() => setMoveTarget(null)}
                className="px-4 py-2 rounded-xl text-[13.5px] font-medium sidebar-row pressable cursor-pointer"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={moving || !moveNewName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13.5px] font-medium pressable cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
              >
                {moving && <Loader2 size={14} className="animate-spin" />}
                <span>确认移动</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Calm in-app Delete Confirmation Modal */}
      {(confirmDeleteFile || confirmDeleteFolder) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
          onClick={() => {
            if (!deleting) {
              setConfirmDeleteFile(null)
              setConfirmDeleteFolder(null)
            }
          }}
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
              <h3 className="text-[16px] font-semibold">
                {confirmDeleteFolder ? '删除这个空文件夹？' : '删除这个文件？'}
              </h3>
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                将永久删除「
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {confirmDeleteFolder ? confirmDeleteFolder.name : confirmDeleteFile?.name}
                </span>
                」，删除后无法恢复。
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setConfirmDeleteFile(null)
                  setConfirmDeleteFolder(null)
                }}
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
