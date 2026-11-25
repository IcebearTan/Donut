import { useEffect, useRef, useState } from 'react'
import {
  Check,
  LogOut,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  SquarePen,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import type { ChatSession, PortalAppItem, UserProfile } from '../api/client'

interface Props {
  user: UserProfile
  apps: PortalAppItem[]
  activeAppId: string
  sessions: ChatSession[]
  activeSessionId: string | null
  theme: 'light' | 'dark'
  desktopOpen: boolean
  openMobile: boolean
  onToggleDesktop: () => void
  onCloseMobile: () => void
  onSelectApp: (app: PortalAppItem) => void
  onNewSession: () => void
  onSelectSession: (id: string) => void
  onRenameSession: (id: string, title: string) => void
  onDeleteSession: (id: string) => void
  onSetTheme: (theme: 'light' | 'dark') => void
  onOpenSettings: (tab: 'persona' | 'account') => void
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
  sessions,
  activeSessionId,
  theme,
  desktopOpen,
  openMobile,
  onToggleDesktop,
  onCloseMobile,
  onSelectApp,
  onNewSession,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onSetTheme,
  onOpenSettings,
  onLogout,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement>(null)

  const assistantEmoji = user.assistant_emoji || '🍩'
  const assistantName = user.assistant_name || 'Donut'
  const externalApps = apps.filter((a) => a.type === 'link')
  const grouped = groupSessionsByDate(sessions)

  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  function startEdit(s: ChatSession, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(s.id)
    setDraftTitle(s.title)
  }

  function commitEdit(id: string) {
    const t = draftTitle.trim()
    if (t) onRenameSession(id, t)
    setEditingId(null)
  }

  const sidebarBody = (isMobile: boolean) => (
    <aside
      className="h-full w-[260px] flex flex-col select-none"
      style={{
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Top brand + collapse */}
      <div className="h-12 px-3 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => {
            onNewSession()
            if (isMobile) onCloseMobile()
          }}
          className="flex items-center gap-2 px-1.5 py-1 rounded-lg text-sm font-semibold tracking-tight sidebar-row cursor-pointer"
          style={{ color: 'var(--text-primary)' }}
          title="回到新对话"
        >
          <span className="text-base leading-none">{assistantEmoji}</span>
          <span className="truncate max-w-[155px]">{assistantName}</span>
        </button>

        <button
          type="button"
          onClick={isMobile ? onCloseMobile : onToggleDesktop}
          title="收起侧边栏"
          className="p-1.5 rounded-lg sidebar-row cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
        >
          {isMobile ? <X size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Primary actions (New Chat + Island + future M2 Projects slot) */}
      <div className="px-2 pb-2 space-y-0.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            onNewSession()
            if (isMobile) onCloseMobile()
          }}
          data-active={activeAppId === 'donut' && activeSessionId === null ? 'true' : 'false'}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13.5px] font-medium sidebar-row cursor-pointer text-left"
          style={{ color: 'var(--text-primary)' }}
        >
          <SquarePen size={15} className="shrink-0 opacity-80" />
          <span>新对话</span>
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
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-[13.5px] font-medium sidebar-row cursor-pointer text-left"
              style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="text-[15px] leading-none shrink-0">{app.emoji}</span>
                <span className="truncate">{app.shortName}</span>
              </span>
              {isActive && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: 'var(--success)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Conversation history grouped by date */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {sessions.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            发一句话开始新对话
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.label}>
                <div
                  className="px-2.5 pb-1 text-[11px] font-medium"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((s) => {
                    const active = activeAppId === 'donut' && s.id === activeSessionId
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
                        className="group flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm cursor-pointer sidebar-row"
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
                                if (e.key === 'Enter') commitEdit(s.id)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              className="flex-1 min-w-0 px-1.5 py-0.5 text-xs rounded outline-none"
                              style={{
                                background: 'var(--bg-surface)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-strong)',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => commitEdit(s.id)}
                              className="p-1 cursor-pointer"
                              style={{ color: 'var(--success)' }}
                            >
                              <Check size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1 cursor-pointer"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="flex-1 truncate text-[13.5px] leading-snug">
                              {s.title}
                            </span>
                            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => startEdit(s, e)}
                                title="重命名"
                                className="p-1 rounded hover:opacity-80 cursor-pointer"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onDeleteSession(s.id)
                                }}
                                title="删除对话"
                                className="p-1 rounded hover:opacity-80 cursor-pointer"
                                style={{ color: 'var(--danger)' }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom-left unified Account & Settings Popover (ChatGPT product style) */}
      <div
        ref={menuWrapRef}
        className="p-2 relative shrink-0"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        {menuOpen && (
          <div
            className="absolute left-2 right-2 bottom-[calc(100%+6px)] rounded-2xl p-1.5 z-50"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onOpenSettings('persona')
                if (isMobile) onCloseMobile()
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] sidebar-row cursor-pointer text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              <Sparkles size={14} className="shrink-0 opacity-75" />
              <span>助手人设与定制</span>
            </button>

            {/* Inline theme switcher */}
            <div
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px]"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="flex items-center gap-2.5">
                {theme === 'light' ? (
                  <Sun size={14} className="shrink-0 opacity-75" />
                ) : (
                  <Moon size={14} className="shrink-0 opacity-75" />
                )}
                <span>外观</span>
              </span>
              <div
                className="flex items-center p-0.5 rounded-lg text-[11px]"
                style={{ background: 'var(--bg-elevated)' }}
              >
                <button
                  type="button"
                  onClick={() => onSetTheme('light')}
                  className="px-2 py-0.5 rounded-md cursor-pointer transition-colors"
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
                  className="px-2 py-0.5 rounded-md cursor-pointer transition-colors"
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
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] sidebar-row cursor-pointer text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              <SlidersHorizontal size={14} className="shrink-0 opacity-75" />
              <span>账号与安全</span>
            </button>

            <div className="my-1" style={{ borderTop: '1px solid var(--border-subtle)' }} />

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onLogout()
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] sidebar-row cursor-pointer text-left"
              style={{ color: 'var(--danger)' }}
            >
              <LogOut size={14} className="shrink-0 opacity-85" />
              <span>退出登录</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          data-testid="user-menu-trigger"
          className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl sidebar-row cursor-pointer"
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
            <span className="truncate text-[13.5px] font-medium">{user.display_name}</span>
          </span>
          <MoreHorizontal size={15} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop collapsible sidebar */}
      {desktopOpen && (
        <div className="hidden lg:block h-full shrink-0">{sidebarBody(false)}</div>
      )}

      {/* Mobile slide-over drawer */}
      {openMobile && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="relative z-50 h-full">{sidebarBody(true)}</div>
          <div
            className="flex-1 bg-black/40 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
        </div>
      )}
    </>
  )
}
