import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  CornerUpLeft,
  Download,
  FolderArchive,
  FolderInput,
  FolderPlus,
  Loader2,
  LogOut,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkles,
  SquarePen,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import type { ChatSession, PortalAppItem, ProjectItem, UserProfile } from '../api/client'
import type { SettingsSection } from './ProfileSettingsView'

interface Props {
  user: UserProfile
  apps: PortalAppItem[]
  activeAppId: string
  projects: ProjectItem[]
  activeProjectId: string | null
  sessions: ChatSession[]
  activeSessionId: string | null
  streamingSessionId?: string | null
  theme: 'light' | 'dark'
  desktopOpen: boolean
  openMobile: boolean
  onToggleDesktop: () => void
  onCloseMobile: () => void
  onSelectApp: (app: PortalAppItem) => void
  onSelectMainSession: () => void
  onNewStandaloneSession: () => void
  onSelectProject: (projectId: string) => void
  onNewProjectSession: (projectId: string) => void
  onCreateProject: () => void
  onEditProject: (projectId: string) => void
  onSelectSession: (id: string) => void
  onRenameSession: (id: string, title: string) => void
  onMoveSession: (id: string, projectId: string | null) => Promise<void> | void
  onAutoTitleSession: (id: string) => Promise<void> | void
  onDeleteSession: (id: string) => Promise<void> | void
  onSetTheme: (theme: 'light' | 'dark') => void
  onOpenSettings: (section: SettingsSection) => void
  onOpenVault: () => void
  onOpenSkills: () => void
  showInstallApp?: boolean
  onInstallApp?: () => void
  onLogout: () => void
}

function groupSessionsByDate(sessions: ChatSession[]): Array<{ label: string; items: ChatSession[] }> {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000

  const today: ChatSession[] = []
  const yesterday: ChatSession[] = []
  const earlier: ChatSession[] = []

  for (const s of sessions) {
    const t = s.updated_at || s.created_at
    if (t >= startOfToday) today.push(s)
    else if (t >= startOfYesterday) yesterday.push(s)
    else earlier.push(s)
  }

  const groups: Array<{ label: string; items: ChatSession[] }> = []
  if (today.length) groups.push({ label: '今天', items: today })
  if (yesterday.length) groups.push({ label: '昨天', items: yesterday })
  if (earlier.length) groups.push({ label: '更早', items: earlier })
  return groups
}

export function SessionSidebar({
  user,
  apps,
  activeAppId,
  projects,
  activeProjectId,
  sessions,
  activeSessionId,
  streamingSessionId,
  theme,
  desktopOpen,
  openMobile,
  onToggleDesktop,
  onCloseMobile,
  onSelectApp,
  onSelectMainSession,
  onNewStandaloneSession,
  onSelectProject,
  onNewProjectSession,
  onCreateProject,
  onEditProject,
  onSelectSession,
  onRenameSession,
  onMoveSession,
  onAutoTitleSession,
  onDeleteSession,
  onSetTheme,
  onOpenSettings,
  onOpenVault,
  onOpenSkills,
  showInstallApp,
  onInstallApp,
  onLogout,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [sessionMenu, setSessionMenu] = useState<{
    session: ChatSession
    top: number
    left: number
    isMobile: boolean
  } | null>(null)
  const [movePickerOpen, setMovePickerOpen] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ChatSession | null>(null)

  const desktopMenuRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const sessionMenuRef = useRef<HTMLDivElement>(null)

  const assistantEmoji = user.assistant_emoji || '🍩'
  const assistantName = user.assistant_name || 'Donut'
  const externalApps = apps.filter((a) => a.type === 'link')

  const mainSession = sessions.find((s) => Boolean(s.is_main)) || null
  const standaloneSessions = sessions.filter((s) => !s.is_main && !s.project_id)
  const groupedStandalone = groupSessionsByDate(standaloneSessions)

  useEffect(() => {
    if (activeProjectId) {
      setExpandedProjects((prev) =>
        prev[activeProjectId] ? prev : { ...prev, [activeProjectId]: true },
      )
    }
  }, [activeProjectId])

  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      const inDesktop = desktopMenuRef.current?.contains(target)
      const inMobile = mobileMenuRef.current?.contains(target)
      if (!inDesktop && !inMobile) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  useEffect(() => {
    if (!sessionMenu) return
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (sessionMenuRef.current?.contains(target)) return
      setSessionMenu(null)
      setMovePickerOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSessionMenu(null)
        setMovePickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [sessionMenu])

  function openSessionMenu(s: ChatSession, isMobile: boolean, e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (sessionMenu?.session.id === s.id) {
      setSessionMenu(null)
      setMovePickerOpen(false)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const menuWidth = 212
    const estimatedHeight = 250
    const left = Math.max(12, Math.min(rect.right - menuWidth + 12, window.innerWidth - menuWidth - 12))
    const openUpward = rect.bottom + estimatedHeight > window.innerHeight - 16
    const top = openUpward
      ? Math.max(12, rect.top - estimatedHeight + 24)
      : Math.min(rect.bottom + 6, window.innerHeight - estimatedHeight - 12)
    setMovePickerOpen(false)
    setSessionMenu({ session: s, top, left, isMobile })
  }

  function startEditSession(s: ChatSession) {
    setSessionMenu(null)
    setMovePickerOpen(false)
    setEditingId(s.id)
    setDraftTitle(s.title)
  }

  function commitEdit(id: string) {
    const t = draftTitle.trim()
    if (t) onRenameSession(id, t)
    setEditingId(null)
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    const target = confirmDelete
    setBusyAction(`delete:${target.id}`)
    try {
      await onDeleteSession(target.id)
      setConfirmDelete(null)
    } finally {
      setBusyAction(null)
    }
  }

  function renderSessionRow(s: ChatSession, isMobile: boolean, nested = false) {
    const active = activeAppId === 'donut' && s.id === activeSessionId
    const isStreamingRow = Boolean(streamingSessionId && streamingSessionId === s.id)
    const isEditing = editingId === s.id
    return (
      <div
        key={s.id}
        data-active={active ? 'true' : 'false'}
        onClick={() => {
          if (!isEditing) {
            onSelectSession(s.id)
            if (isMobile) onCloseMobile()
          }
        }}
        className={`group flex items-center gap-2 rounded-xl cursor-pointer sidebar-row ${
          nested ? 'px-3 py-1.5' : 'px-3 py-2'
        }`}
        style={{
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
      >
        {isEditing ? (
          <div
            className="flex-1 flex items-center gap-1 min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  commitEdit(s.id)
                }
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="flex-1 min-w-0 px-2 py-1 text-sm rounded outline-none"
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-strong)',
              }}
            />
            <button
              type="button"
              onClick={() => commitEdit(s.id)}
              className="p-1 pressable cursor-pointer"
              style={{ color: 'var(--success)' }}
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="p-1 pressable cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <>
            {isStreamingRow && (
              <span
                title="正在回复中"
                className="w-2 h-2 rounded-full shrink-0 animate-soft-breathe"
                style={{ background: '#f59e0b' }}
              />
            )}
            <span
              className={`flex-1 truncate leading-snug ${
                nested ? 'text-[13.5px]' : 'text-[14px]'
              }`}
            >
              {s.title}
            </span>
            <button
              type="button"
              data-testid={`session-menu-btn-${s.id}`}
              onClick={(e) => openSessionMenu(s, isMobile, e)}
              title="对话设置"
              aria-label="对话设置"
              className={`p-1 rounded-lg hover:opacity-100 pressable cursor-pointer shrink-0 transition-opacity ${
                sessionMenu?.session.id === s.id
                  ? 'opacity-100'
                  : active
                    ? 'opacity-65 lg:opacity-0 lg:group-hover:opacity-100'
                    : 'opacity-60 lg:opacity-0 lg:group-hover:opacity-100'
              }`}
              style={{
                color: 'var(--text-muted)',
                background: sessionMenu?.session.id === s.id ? 'var(--bg-active)' : 'transparent',
              }}
            >
              <MoreHorizontal size={15} />
            </button>
          </>
        )}
      </div>
    )
  }

  const sidebarBody = (isMobile: boolean) => (
    <aside
      className={`h-full flex flex-col select-none shrink-0 ${
        isMobile ? 'w-[288px] max-w-[84vw]' : 'w-[276px]'
      }`}
      style={{
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Top brand + collapse */}
      <div className="h-14 px-3.5 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => {
            onSelectMainSession()
            if (isMobile) onCloseMobile()
          }}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-[15.5px] font-semibold tracking-tight sidebar-row cursor-pointer"
          style={{ color: 'var(--text-primary)' }}
          title="回到主对话"
        >
          <span className="text-lg leading-none">{assistantEmoji}</span>
          <span className="truncate max-w-[165px]">{assistantName}</span>
        </button>

        <button
          type="button"
          onClick={isMobile ? onCloseMobile : onToggleDesktop}
          title="收起侧边栏"
          data-testid="sidebar-collapse-btn"
          className="p-2 rounded-xl sidebar-row pressable cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
        >
          {isMobile ? <X size={18} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      {/* Primary nav: Main Stream (游龙) + New Chat + I-land */}
      <div className="px-2.5 pb-2.5 space-y-1 shrink-0">
        <button
          type="button"
          data-testid="main-chat-nav"
          data-active={
            activeAppId === 'donut' && Boolean(mainSession && activeSessionId === mainSession.id)
              ? 'true'
              : 'false'
          }
          onClick={() => {
            onSelectMainSession()
            if (isMobile) onCloseMobile()
          }}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[14.5px] font-medium sidebar-row cursor-pointer text-left"
          style={{ color: 'var(--text-primary)' }}
        >
          <span className="flex items-center gap-3 min-w-0">
            <Compass size={17} className="shrink-0 opacity-80" />
            <span className="truncate">主对话</span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {mainSession && streamingSessionId === mainSession.id && (
              <span
                title="正在回复中"
                className="w-2 h-2 rounded-full animate-soft-breathe"
                style={{ background: '#f59e0b' }}
              />
            )}
            {projects.length > 0 && (
              <span
                className="text-[11px] px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                }}
              >
                游龙
              </span>
            )}
          </span>
        </button>

        <button
          type="button"
          data-testid="new-chat-btn"
          data-active={
            activeAppId === 'donut' && activeSessionId === null && activeProjectId === null
              ? 'true'
              : 'false'
          }
          onClick={() => {
            onNewStandaloneSession()
            if (isMobile) onCloseMobile()
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14.5px] font-medium sidebar-row cursor-pointer text-left"
          style={{ color: 'var(--text-secondary)' }}
        >
          <SquarePen size={17} className="shrink-0 opacity-80" />
          <span>新对话</span>
        </button>

        <button
          type="button"
          data-testid="open-vault-nav"
          data-active={activeAppId === 'vault' ? 'true' : 'false'}
          onClick={() => {
            onOpenVault()
            if (isMobile) onCloseMobile()
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14.5px] font-medium sidebar-row cursor-pointer text-left"
          style={{ color: activeAppId === 'vault' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          <FolderArchive size={17} className="shrink-0 opacity-80" />
          <span>文件仓</span>
        </button>

        <button
          type="button"
          data-testid="open-skills-nav"
          data-active={activeAppId === 'skills' ? 'true' : 'false'}
          onClick={() => {
            onOpenSkills()
            if (isMobile) onCloseMobile()
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14.5px] font-medium sidebar-row cursor-pointer text-left"
          style={{ color: activeAppId === 'skills' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          <Sparkles size={17} className="shrink-0 opacity-80" />
          <span>技能库</span>
        </button>

        {externalApps.map((app) => {
          const isActive = activeAppId === app.id
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => {
                onSelectApp(app)
                if (isMobile) onCloseMobile()
              }}
              data-active={isActive ? 'true' : 'false'}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[14.5px] font-medium sidebar-row cursor-pointer text-left"
              style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="text-[17px] leading-none shrink-0">{app.emoji}</span>
                <span className="truncate">{app.shortName}</span>
              </span>
              {isActive && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: 'var(--success)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Scrollable Projects + History */}
      <div className="chat-scroll flex-1 overflow-y-auto px-2.5 pb-3 pt-1.5 space-y-5">
        {/* Projects section */}
        <div>
          <div className="px-3 pb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              项目
            </span>
            <button
              type="button"
              data-testid="create-project-btn"
              onClick={() => {
                onCreateProject()
                if (isMobile) onCloseMobile()
              }}
              title="新建项目记忆空间"
              className="p-1.5 rounded-lg sidebar-row pressable cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <FolderPlus size={15} />
            </button>
          </div>

          {projects.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                onCreateProject()
                if (isMobile) onCloseMobile()
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] sidebar-row cursor-pointer text-left"
              style={{ color: 'var(--text-muted)' }}
            >
              <Plus size={15} />
              <span>创建第一个项目记忆…</span>
            </button>
          ) : (
            <div className="space-y-1">
              {projects.map((p) => {
                const projSessions = sessions.filter((s) => s.project_id === p.id && !s.is_main)
                const isExpanded = Boolean(expandedProjects[p.id])
                const isActiveProj = activeAppId === 'donut' && activeProjectId === p.id

                return (
                  <div key={p.id}>
                    <div
                      data-testid={`project-row-${p.id}`}
                      data-active={isActiveProj && !activeSessionId ? 'true' : 'false'}
                      onClick={() => {
                        if (isActiveProj && isExpanded) {
                          setExpandedProjects((prev) => ({ ...prev, [p.id]: false }))
                        } else {
                          setExpandedProjects((prev) => ({ ...prev, [p.id]: true }))
                          onSelectProject(p.id)
                          if (isMobile) onCloseMobile()
                        }
                      }}
                      className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer sidebar-row"
                      style={{
                        color: isActiveProj ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      <span className="text-[17px] leading-none shrink-0">{p.emoji || '📁'}</span>
                      <span className="flex-1 truncate text-[14.5px] font-medium">{p.name}</span>

                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedProjects((prev) => ({ ...prev, [p.id]: true }))
                            onNewProjectSession(p.id)
                            if (isMobile) onCloseMobile()
                          }}
                          title="在此项目内新开对话"
                          className="p-1 rounded-lg hover:opacity-80 pressable cursor-pointer"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditProject(p.id)
                            if (isMobile) onCloseMobile()
                          }}
                          title="查看 / 编辑项目记忆"
                          className="p-1 rounded-lg hover:opacity-80 pressable cursor-pointer"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <BookOpen size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Smooth borderless accordion for project sub-sessions (pure whitespace indent) */}
                    <div className="accordion-grid" data-open={isExpanded ? 'true' : 'false'}>
                      <div className="accordion-inner">
                        <div className="pl-5 mt-0.5 mb-1.5 space-y-0.5">
                          {projSessions.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                onNewProjectSession(p.id)
                                if (isMobile) onCloseMobile()
                              }}
                              className="w-full text-left px-3 py-1.5 rounded-xl text-[13px] sidebar-row cursor-pointer"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              + 开始项目对话
                            </button>
                          ) : (
                            projSessions.map((s) => renderSessionRow(s, isMobile, true))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Standalone chat history grouped by date */}
        {groupedStandalone.length > 0 && (
          <div className="space-y-4">
            {groupedStandalone.map((group) => (
              <div key={group.label}>
                <div
                  className="px-3 pb-1.5 text-xs font-medium"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((s) => renderSessionRow(s, isMobile, false))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom-left unified Account & Settings Popover — compact & balanced */}
      <div
        ref={isMobile ? mobileMenuRef : desktopMenuRef}
        className={`px-2.5 pt-1.5 relative shrink-0 ${
          isMobile ? 'pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]' : 'pb-2'
        }`}
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        {menuOpen && (
          <div
            className="absolute left-2.5 right-2.5 bottom-[calc(100%+8px)] rounded-2xl p-1.5 z-50 animate-pop-up"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <button
              type="button"
              data-testid="menu-open-profile-overview"
              onClick={() => {
                setMenuOpen(false)
                onOpenSettings('overview')
                if (isMobile) onCloseMobile()
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] sidebar-row cursor-pointer text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              <CalendarDays size={15} className="shrink-0 opacity-75" />
              <span>个人主页与活跃日历</span>
            </button>

            <button
              type="button"
              data-testid="menu-open-assistant-persona"
              onClick={() => {
                setMenuOpen(false)
                onOpenSettings('assistant')
                if (isMobile) onCloseMobile()
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] sidebar-row cursor-pointer text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              <Sparkles size={15} className="shrink-0 opacity-75" />
              <span>助手定制与人设</span>
            </button>

            <div
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[14px]"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="flex items-center gap-3">
                {theme === 'light' ? (
                  <Sun size={15} className="shrink-0 opacity-75" />
                ) : (
                  <Moon size={15} className="shrink-0 opacity-75" />
                )}
                <span>外观</span>
              </span>
              <div
                className="flex items-center p-0.5 rounded-lg text-xs"
                style={{ background: 'var(--bg-elevated)' }}
              >
                <button
                  type="button"
                  onClick={() => onSetTheme('light')}
                  className="px-2.5 py-1 rounded-md pressable cursor-pointer"
                  style={{
                    background: theme === 'light' ? 'var(--bg-surface)' : 'transparent',
                    color: theme === 'light' ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: theme === 'light' ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  浅色
                </button>
                <button
                  type="button"
                  onClick={() => onSetTheme('dark')}
                  className="px-2.5 py-1 rounded-md pressable cursor-pointer"
                  style={{
                    background: theme === 'dark' ? 'var(--bg-surface)' : 'transparent',
                    color: theme === 'dark' ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: theme === 'dark' ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  深色
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onOpenSettings('account')
                if (isMobile) onCloseMobile()
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] sidebar-row cursor-pointer text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              <SlidersHorizontal size={15} className="shrink-0 opacity-75" />
              <span>账号与安全</span>
            </button>

            {showInstallApp && onInstallApp && (
              <button
                type="button"
                data-testid="pwa-install-menu-btn"
                onClick={() => {
                  setMenuOpen(false)
                  onInstallApp()
                  if (isMobile) onCloseMobile()
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] sidebar-row cursor-pointer text-left"
                style={{ color: 'var(--text-primary)' }}
              >
                <Download size={15} className="shrink-0 opacity-75" />
                <span>安装为手机 / 桌面应用</span>
              </button>
            )}

            <div className="my-1" style={{ borderTop: '1px solid var(--border-subtle)' }} />

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onLogout()
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] sidebar-row cursor-pointer text-left"
              style={{ color: 'var(--danger)' }}
            >
              <LogOut size={15} className="shrink-0 opacity-85" />
              <span>退出登录</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          data-testid="user-menu-trigger"
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl sidebar-row cursor-pointer"
          style={{
            background: menuOpen ? 'var(--bg-hover)' : 'transparent',
            color: 'var(--text-primary)',
          }}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {user.avatar_emoji}
            </span>
            <span className="truncate text-[14px] font-medium leading-none">{user.display_name}</span>
          </span>
          <MoreHorizontal size={15} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Smooth animated collapsible desktop sidebar */}
      <div
        className="hidden lg:block h-full shrink-0 overflow-hidden panel-slide"
        style={{
          width: desktopOpen ? '276px' : '0px',
          opacity: desktopOpen ? 1 : 0,
        }}
        aria-hidden={!desktopOpen}
      >
        {sidebarBody(false)}
      </div>

      {/* Smooth GPU-accelerated mobile slide-over drawer (invisible when closed to avoid WebView compositing glitches) */}
      <div
        className={`fixed inset-0 z-50 lg:hidden flex transition-opacity duration-200 ${
          openMobile
            ? 'opacity-100 pointer-events-auto visible'
            : 'opacity-0 pointer-events-none invisible'
        }`}
        aria-hidden={!openMobile}
      >
        <div
          className="relative z-10 h-full safe-pt transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            background: 'var(--bg-sidebar)',
            transform: openMobile ? 'translateX(0)' : 'translateX(-100%)',
          }}
        >
          {sidebarBody(true)}
        </div>
        {openMobile && (
          <div className="flex-1 bg-black/40 animate-backdrop-in" onClick={onCloseMobile} />
        )}
      </div>

      {/* Floating viewport-fixed Session Action Popover (never clipped by sidebar scroll!) */}
      {sessionMenu && (
        <div
          ref={sessionMenuRef}
          data-testid="session-action-menu"
          className="fixed z-50 w-[212px] rounded-2xl p-1.5 animate-pop-up select-none"
          style={{
            top: `${sessionMenu.top}px`,
            left: `${sessionMenu.left}px`,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <button
            type="button"
            data-testid="session-action-rename"
            onClick={() => startEditSession(sessionMenu.session)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] sidebar-row cursor-pointer text-left"
            style={{ color: 'var(--text-primary)' }}
          >
            <Pencil size={14} className="shrink-0 opacity-75" />
            <span>重命名</span>
          </button>

          <button
            type="button"
            data-testid="session-action-autotitle"
            disabled={busyAction !== null}
            onClick={async () => {
              const target = sessionMenu.session
              setBusyAction(`title:${target.id}`)
              try {
                await onAutoTitleSession(target.id)
              } finally {
                setBusyAction(null)
                setSessionMenu(null)
                setMovePickerOpen(false)
              }
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] sidebar-row cursor-pointer text-left disabled:opacity-50"
            style={{ color: 'var(--text-primary)' }}
          >
            {busyAction === `title:${sessionMenu.session.id}` ? (
              <Loader2 size={14} className="shrink-0 animate-spin opacity-75" />
            ) : (
              <Sparkles size={14} className="shrink-0 opacity-75" />
            )}
            <span>智能提炼标题</span>
          </button>

          <button
            type="button"
            data-testid="session-action-move-toggle"
            onClick={() => setMovePickerOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13.5px] sidebar-row cursor-pointer text-left"
            style={{
              color: 'var(--text-primary)',
              background: movePickerOpen ? 'var(--bg-hover)' : 'transparent',
            }}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <FolderInput size={14} className="shrink-0 opacity-75" />
              <span className="truncate">
                {sessionMenu.session.project_id ? '更换所属项目' : '移动到项目'}
              </span>
            </span>
            {movePickerOpen ? (
              <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
            ) : (
              <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
            )}
          </button>

          {movePickerOpen && (
            <div
              data-testid="session-move-project-list"
              className="mt-1 mb-1 mx-1 p-1 rounded-xl space-y-0.5 max-h-44 overflow-y-auto"
              style={{
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {projects.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const isMob = sessionMenu.isMobile
                    setSessionMenu(null)
                    setMovePickerOpen(false)
                    onCreateProject()
                    if (isMob) onCloseMobile()
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs sidebar-row cursor-pointer text-left"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <FolderPlus size={13} className="shrink-0 opacity-75" />
                  <span>先新建一个项目…</span>
                </button>
              ) : (
                <>
                  {projects.map((p) => {
                    const isCurrent = sessionMenu.session.project_id === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={busyAction !== null}
                        data-testid={`move-to-project-${p.id}`}
                        onClick={async () => {
                          const target = sessionMenu.session
                          if (isCurrent) {
                            setSessionMenu(null)
                            setMovePickerOpen(false)
                            return
                          }
                          setBusyAction(`move:${p.id}`)
                          try {
                            await onMoveSession(target.id, p.id)
                            setExpandedProjects((prev) => ({ ...prev, [p.id]: true }))
                          } finally {
                            setBusyAction(null)
                            setSessionMenu(null)
                            setMovePickerOpen(false)
                          }
                        }}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[13px] sidebar-row cursor-pointer text-left disabled:opacity-50"
                        style={{
                          color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-sm leading-none shrink-0">{p.emoji || '📁'}</span>
                          <span className="truncate">{p.name}</span>
                        </span>
                        {isCurrent && (
                          <Check size={13} style={{ color: 'var(--success)' }} className="shrink-0" />
                        )}
                      </button>
                    )
                  })}

                  {sessionMenu.session.project_id && (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      data-testid="move-out-of-project-btn"
                      onClick={async () => {
                        const target = sessionMenu.session
                        setBusyAction('move:none')
                        try {
                          await onMoveSession(target.id, null)
                        } finally {
                          setBusyAction(null)
                          setSessionMenu(null)
                          setMovePickerOpen(false)
                        }
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] sidebar-row cursor-pointer text-left mt-0.5"
                      style={{
                        color: 'var(--text-muted)',
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                    >
                      <CornerUpLeft size={13} className="shrink-0" />
                      <span>移出项目</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="my-1" style={{ borderTop: '1px solid var(--border-subtle)' }} />

          <button
            type="button"
            data-testid="session-action-delete"
            onClick={() => {
              const target = sessionMenu.session
              setSessionMenu(null)
              setMovePickerOpen(false)
              setConfirmDelete(target)
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] sidebar-row cursor-pointer text-left"
            style={{ color: 'var(--danger)' }}
          >
            <Trash2 size={14} className="shrink-0 opacity-85" />
            <span>删除对话</span>
          </button>
        </div>
      )}

      {/* Calm in-app Delete Confirmation Modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
          onClick={() => !busyAction && setConfirmDelete(null)}
        >
          <div
            data-testid="delete-session-modal"
            className="w-full max-w-sm rounded-2xl p-5 space-y-4 animate-modal-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-[16px] font-semibold">删除这段对话？</h3>
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                将永久删除「<span className="font-medium" style={{ color: 'var(--text-primary)' }}>{confirmDelete.title}</span>」，删除后聊天记录无法恢复。
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                data-testid="cancel-delete-session-btn"
                disabled={busyAction !== null}
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-[13.5px] font-medium sidebar-row pressable cursor-pointer"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
              >
                取消
              </button>
              <button
                type="button"
                data-testid="confirm-delete-session-btn"
                disabled={busyAction !== null}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13.5px] font-medium pressable cursor-pointer disabled:opacity-50"
                style={{
                  background: 'var(--danger)',
                  color: '#ffffff',
                }}
              >
                {busyAction === `delete:${confirmDelete.id}` && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                <span>确认删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
