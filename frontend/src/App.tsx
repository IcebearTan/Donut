import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api,
  streamChat,
  type ChatMessage,
  type ChatSession,
  type PortalAppItem,
  type UserProfile,
} from './api/client'
import { LoginView } from './components/LoginView'
import { AppHeader } from './components/AppHeader'
import { SessionSidebar } from './components/SessionSidebar'
import { ChatView } from './components/ChatView'
import { SettingsModal } from './components/SettingsModal'

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('portal_theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // ignore
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [apps, setApps] = useState<PortalAppItem[]>([])
  const [activeAppId, setActiveAppId] = useState('donut')
  const [externalLaunchUrl, setExternalLaunchUrl] = useState<string | null>(null)

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('portal_theme', theme)
    } catch {
      // ignore
    }
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f1115' : '#ffffff')
  }, [theme])

  const loadWorkspace = useCallback(async () => {
    const [meRes, sessRes] = await Promise.all([api.me(), api.listSessions()])
    setUser(meRes.user)
    setApps(meRes.apps)
    setSessions(sessRes.sessions)
    if (sessRes.sessions.length > 0) {
      const firstId = sessRes.sessions[0].id
      setActiveSessionId(firstId)
      const msgRes = await api.getMessages(firstId)
      setMessages(msgRes.messages)
    } else {
      setActiveSessionId(null)
      setMessages([])
    }
  }, [])

  useEffect(() => {
    loadWorkspace()
      .catch(() => {
        setUser(null)
      })
      .finally(() => setCheckingAuth(false))
  }, [loadWorkspace])

  async function handleSelectSession(id: string) {
    if (streaming) return
    setActiveSessionId(id)
    try {
      const res = await api.getMessages(id)
      setMessages(res.messages)
    } catch {
      setMessages([])
    }
  }

  function handleNewSession() {
    if (streaming) return
    setActiveSessionId(null)
    setMessages([])
  }

  async function handleRenameSession(id: string, title: string) {
    await api.renameSession(id, title)
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)))
  }

  async function handleDeleteSession(id: string) {
    if (streaming) return
    await api.deleteSession(id)
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (activeSessionId === id) {
        const fallback = next[0]?.id || null
        setActiveSessionId(fallback)
        if (fallback) {
          api.getMessages(fallback).then((r) => setMessages(r.messages)).catch(() => setMessages([]))
        } else {
          setMessages([])
        }
      }
      return next
    })
  }

  async function handleSend(text: string, imageIds: string[], imageUrls: string[]) {
    let sid = activeSessionId
    if (!sid) {
      const created = await api.createSession('新对话')
      sid = created.session.id
      setSessions((prev) => [created.session, ...prev])
      setActiveSessionId(sid)
    }

    const tempUserId = `u-${Date.now()}`
    const tempAsstId = `a-${Date.now()}`
    const now = Date.now()

    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        role: 'user',
        content: text,
        images: imageUrls,
        created_at: now,
        deliveryStatus: 'sending',
      },
      {
        id: tempAsstId,
        role: 'assistant',
        content: '',
        thinking: '',
        tools: [],
        created_at: now + 1,
        startedAt: now,
        streaming: true,
      },
    ])

    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)

    try {
      await streamChat(
        { session_id: sid, content: text, images: imageIds },
        (ev) => {
          if (ev.type === 'meta') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempUserId ? { ...m, deliveryStatus: 'delivered' } : m,
              ),
            )
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sid ? { ...s, title: ev.title, updated_at: Date.now() } : s,
              ),
            )
          } else if (ev.type === 'heartbeat') {
            // Keep-alive signal from backend — confirms connection is healthy
          } else if (ev.type === 'thinking') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAsstId
                  ? { ...m, thinking: (m.thinking || '') + ev.delta }
                  : m,
              ),
            )
          } else if (ev.type === 'tool') {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== tempAsstId) return m
                const existing = m.tools || []
                const idx = existing.findIndex((t) => t.id === ev.id)
                const nextTools =
                  idx >= 0
                    ? existing.map((t, i) =>
                        i === idx ? { id: ev.id, name: ev.name, status: ev.status } : t,
                      )
                    : [...existing, { id: ev.id, name: ev.name, status: ev.status }]
                return { ...m, tools: nextTools }
              }),
            )
          } else if (ev.type === 'delta') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAsstId ? { ...m, content: m.content + ev.text } : m,
              ),
            )
          } else if (ev.type === 'done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAsstId ? { ...m, usage: ev.usage, streaming: false } : m,
              ),
            )
          } else if (ev.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAsstId
                  ? {
                      ...m,
                      content: m.content
                        ? `${m.content}\n\n> ⚠️ ${ev.message}`
                        : `⚠️ ${ev.message}`,
                      streaming: false,
                    }
                  : m,
              ),
            )
          }
        },
        controller.signal,
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : '连接中断'
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === tempUserId && m.deliveryStatus === 'sending') {
              return { ...m, deliveryStatus: 'failed' }
            }
            if (m.id === tempAsstId) {
              return { ...m, content: m.content || `⚠️ ${msg}`, streaming: false }
            }
            return m
          }),
        )
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempAsstId ? { ...m, streaming: false } : m)),
      )
      setStreaming(false)
      abortRef.current = null
    }
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  async function handleSelectApp(app: PortalAppItem) {
    if (app.type === 'internal') {
      setActiveAppId(app.id)
      return
    }
    setActiveAppId(app.id)
    setExternalLaunchUrl(null)
    try {
      const res = await api.launchApp(app.id)
      setExternalLaunchUrl(res.url)
    } catch {
      setExternalLaunchUrl(app.path)
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {})
    setUser(null)
    setSessions([])
    setActiveSessionId(null)
    setMessages([])
    setActiveAppId('donut')
    setExternalLaunchUrl(null)
  }

  if (checkingAuth) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
        正在进入空间…
      </div>
    )
  }

  if (!user) {
    return (
      <LoginView
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onLoggedIn={() => {
          setCheckingAuth(true)
          loadWorkspace().finally(() => setCheckingAuth(false))
        }}
      />
    )
  }

  const activeExternalApp = apps.find((a) => a.id === activeAppId && a.type === 'link')

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-page)' }}>
      <AppHeader
        user={user}
        apps={apps}
        activeAppId={activeAppId}
        theme={theme}
        onSelectApp={handleSelectApp}
        onToggleSidebar={() => setMobileSidebarOpen((v) => !v)}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={handleLogout}
      />

      {activeExternalApp ? (
        <div className="flex-1 flex flex-col min-h-0 relative">
          {externalLaunchUrl ? (
            <iframe
              key={externalLaunchUrl}
              src={externalLaunchUrl}
              title={activeExternalApp.name}
              className="w-full h-full border-0"
            />
          ) : (
            <div
              className="flex-1 flex items-center justify-center text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              正在以 {user.display_name} 身份进入 {activeExternalApp.name}…
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <SessionSidebar
            user={user}
            sessions={sessions}
            activeSessionId={activeSessionId}
            openMobile={mobileSidebarOpen}
            onCloseMobile={() => setMobileSidebarOpen(false)}
            onNewSession={handleNewSession}
            onSelectSession={handleSelectSession}
            onRenameSession={handleRenameSession}
            onDeleteSession={handleDeleteSession}
          />
          <ChatView
            user={user}
            messages={messages}
            streaming={streaming}
            onSend={handleSend}
            onStop={handleStop}
          />
        </div>
      )}

      {settingsOpen && (
        <SettingsModal
          user={user}
          theme={theme}
          onSetTheme={setTheme}
          onUserUpdated={setUser}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
