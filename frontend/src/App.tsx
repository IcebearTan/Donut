import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Menu, PanelLeftOpen } from 'lucide-react'
import {
  api,
  streamChat,
  type ChatMessage,
  type ChatSession,
  type CompanionStatus,
  type PortalAppItem,
  type ProjectItem,
  type UploadedAttachment,
  type UserProfile,
} from './api/client'
import { LoginView } from './components/LoginView'
import { SessionSidebar } from './components/SessionSidebar'
import { ChatView } from './components/ChatView'
import { CompanionPanel, type LiveStreamState } from './components/CompanionPanel'
import { SettingsModal } from './components/SettingsModal'
import { ProjectModal } from './components/ProjectModal'
import { PwaInstallModal } from './components/PwaInstallModal'
import { VaultModal, type VaultTab } from './components/VaultModal'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('portal_theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // ignore
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    Boolean((window.navigator as { standalone?: boolean }).standalone)
  )
}

// Dot-style unhurried pacing:
// 0ms jelly user bubble ("发送中…") -> ~580ms "✓✓ 已送达" -> +520ms Donut arrives thinking -> +420ms reply streams
const MIN_DELIVERY_BEAT_MS = 580
const ASSISTANT_ARRIVE_DELAY_MS = 520
const THINKING_BREATH_MS = 420

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [apps, setApps] = useState<PortalAppItem[]>([])
  const [activeAppId, setActiveAppId] = useState('donut')
  const [externalLaunchUrl, setExternalLaunchUrl] = useState<string | null>(null)

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [distilling, setDistilling] = useState(false)
  const [liveState, setLiveState] = useState<LiveStreamState>({
    streaming: false,
    startedAt: null,
    activeToolName: null,
  })

  const [companionStatus, setCompanionStatus] = useState<CompanionStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)

  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [mobileCompanionOpen, setMobileCompanionOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'persona' | 'account' | null>(null)
  const [vaultModal, setVaultModal] = useState<{ open: boolean; tab: VaultTab }>({
    open: false,
    tab: 'artifacts',
  })
  const [projectModal, setProjectModal] = useState<{ open: boolean; projectId: string | null }>({
    open: false,
    projectId: null,
  })

  // PWA install state
  const [standalone] = useState<boolean>(isRunningStandalone)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [pwaModalOpen, setPwaModalOpen] = useState(false)

  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const showToast = useCallback((text: string) => {
    setToast(text)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('portal_theme', theme)
    } catch {
      // ignore
    }
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#212121' : '#ffffff')
    const appleStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (appleStatus) {
      appleStatus.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default')
    }
  }, [theme])

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setDeferredPrompt(null)
      setPwaModalOpen(false)
      showToast('Donut 已安装到设备')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [showToast])

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const st = await api.getStatus()
      setCompanionStatus(st)
    } catch {
      // ignore transient poll failures
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  const loadWorkspace = useCallback(async () => {
    const [meRes, sessRes, projRes] = await Promise.all([
      api.me(),
      api.listSessions(),
      api.listProjects(),
    ])
    setUser(meRes.user)
    setApps(meRes.apps)
    setSessions(sessRes.sessions)
    setProjects(projRes.projects)

    const nonMain = sessRes.sessions.filter((s) => !s.is_main)
    const mainSess = sessRes.sessions.find((s) => Boolean(s.is_main))
    const initial =
      nonMain.length > 0 && (!mainSess || nonMain[0].updated_at > mainSess.updated_at)
        ? nonMain[0]
        : mainSess || sessRes.sessions[0] || null

    if (initial) {
      setActiveSessionId(initial.id)
      setActiveProjectId(initial.project_id || null)
      const msgRes = await api.getMessages(initial.id)
      setMessages(msgRes.messages)
    } else {
      setActiveSessionId(null)
      setActiveProjectId(null)
      setMessages([])
    }
    api.getStatus().then(setCompanionStatus).catch(() => {})
  }, [])

  useEffect(() => {
    loadWorkspace()
      .catch(() => {
        setUser(null)
      })
      .finally(() => setCheckingAuth(false))
  }, [loadWorkspace])

  useEffect(() => {
    if (!user) return
    const timer = window.setInterval(() => {
      api.getStatus().then(setCompanionStatus).catch(() => {})
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [user])

  async function handleSelectSession(id: string) {
    if (streaming) return
    setActiveAppId('donut')
    setActiveSessionId(id)
    const target = sessions.find((s) => s.id === id)
    setActiveProjectId(target?.project_id || null)
    try {
      const res = await api.getMessages(id)
      setMessages(res.messages)
    } catch {
      setMessages([])
    }
  }

  async function handleSelectMainSession() {
    if (streaming) return
    setActiveAppId('donut')
    setActiveProjectId(null)
    const mainSess = sessions.find((s) => Boolean(s.is_main))
    if (mainSess) {
      setActiveSessionId(mainSess.id)
      try {
        const res = await api.getMessages(mainSess.id)
        setMessages(res.messages)
      } catch {
        setMessages([])
      }
    } else {
      setActiveSessionId(null)
      setMessages([])
    }
  }

  function handleNewStandaloneSession() {
    if (streaming) return
    setActiveAppId('donut')
    setActiveProjectId(null)
    setActiveSessionId(null)
    setMessages([])
  }

  async function handleSelectProject(projectId: string) {
    if (streaming) return
    setActiveAppId('donut')
    setActiveProjectId(projectId)
    const projSessions = sessions.filter((s) => s.project_id === projectId && !s.is_main)
    if (projSessions.length > 0) {
      const latest = projSessions[0]
      setActiveSessionId(latest.id)
      try {
        const res = await api.getMessages(latest.id)
        setMessages(res.messages)
      } catch {
        setMessages([])
      }
    } else {
      setActiveSessionId(null)
      setMessages([])
    }
  }

  function handleNewProjectSession(projectId: string) {
    if (streaming) return
    setActiveAppId('donut')
    setActiveProjectId(projectId)
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
        const fallback = next[0] || null
        setActiveSessionId(fallback?.id || null)
        setActiveProjectId(fallback?.project_id || null)
        if (fallback) {
          api.getMessages(fallback.id).then((r) => setMessages(r.messages)).catch(() => setMessages([]))
        } else {
          setMessages([])
        }
      }
      return next
    })
  }

  async function handleDistillActiveProject() {
    if (!activeProjectId || !activeSessionId || distilling || streaming) return
    const proj = projects.find((p) => p.id === activeProjectId)
    setDistilling(true)
    try {
      await api.distillProject(activeProjectId, activeSessionId)
      showToast(`已沉淀到「${proj?.name || '项目'}」记忆`)
      refreshStatus()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '沉淀失败')
    } finally {
      setDistilling(false)
    }
  }

  async function handleTriggerNativePwaInstall() {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setPwaModalOpen(false)
      }
      setDeferredPrompt(null)
    } catch {
      // ignore
    }
  }

  async function handleSend(text: string, attachments: UploadedAttachment[]) {
    let sid = activeSessionId
    if (!sid) {
      const created = await api.createSession('新对话', activeProjectId)
      sid = created.session.id
      setSessions((prev) => [created.session, ...prev])
      setActiveSessionId(sid)
    }

    const imageFiles = attachments.filter((f) => f.is_image)
    const docFiles = attachments.filter((f) => !f.is_image)
    const imageIds = imageFiles.map((f) => f.id)
    const imageUrls = imageFiles.map((f) => f.url)
    const attachmentIds = docFiles.map((f) => f.id)

    let displayText = text
    if (docFiles.length > 0) {
      const chips = docFiles.map((f) => `📎 \`${f.name}\``).join(' ')
      displayText = displayText ? `${displayText}\n\n${chips}` : chips
    }

    const tempUserId = `u-${Date.now()}`
    const tempAsstId = `a-${Date.now()}`
    const sentAt = Date.now()

    // Phase 1 (T=0ms): Only insert user bubble with gentle "发送中…"
    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        role: 'user',
        content: displayText,
        images: imageUrls,
        created_at: sentAt,
        deliveryStatus: 'sending',
      },
    ])

    const controller = new AbortController()
    abortRef.current = controller
    setStreaming(true)

    let deliveredShown = false
    let assistantInserted = false
    let readyToFlush = false
    let aborted = false
    let deliveryTimer: number | null = null
    let assistantTimer: number | null = null
    let breathTimer: number | null = null

    // Buffer early events so fast replies never short-circuit the calm 3-beat Dot cadence
    let bufferedText = ''
    let bufferedThinking = ''
    let bufferedTools: Array<{ id: string; name: string; status: string }> = []
    let bufferedDoneUsage: ChatMessage['usage'] | undefined
    let bufferedDone = false
    let bufferedError: string | null = null

    let resolveChoreography!: () => void
    const choreographyDone = new Promise<void>((res) => {
      resolveChoreography = res
    })

    const clearChoreographyTimers = () => {
      if (deliveryTimer !== null) {
        window.clearTimeout(deliveryTimer)
        deliveryTimer = null
      }
      if (assistantTimer !== null) {
        window.clearTimeout(assistantTimer)
        assistantTimer = null
      }
      if (breathTimer !== null) {
        window.clearTimeout(breathTimer)
        breathTimer = null
      }
    }

    const markUserDeliveredNow = () => {
      if (deliveredShown) return
      deliveredShown = true
      setMessages((prev) =>
        prev.map((m) => (m.id === tempUserId ? { ...m, deliveryStatus: 'delivered' } : m)),
      )
    }

    const ensureAssistantBubble = (patch?: Partial<ChatMessage>) => {
      if (!assistantInserted) {
        assistantInserted = true
        const appearAt = Date.now()
        setLiveState((prev) => ({
          streaming: true,
          startedAt: prev.startedAt || appearAt,
          activeToolName: prev.activeToolName,
        }))
        setMessages((prev) => [
          ...prev,
          {
            id: tempAsstId,
            role: 'assistant',
            content: '',
            thinking: '',
            tools: [],
            created_at: appearAt,
            startedAt: appearAt,
            streaming: true,
            ...patch,
          },
        ])
      } else if (patch) {
        setMessages((prev) => prev.map((m) => (m.id === tempAsstId ? { ...m, ...patch } : m)))
      }
    }

    const flushBufferedEvents = () => {
      if (readyToFlush) return
      readyToFlush = true
      markUserDeliveredNow()
      ensureAssistantBubble()

      const textToFlush = bufferedText
      const thinkToFlush = bufferedThinking
      const toolsToFlush = bufferedTools
      const errToFlush = bufferedError
      const doneToFlush = bufferedDone
      const usageToFlush = bufferedDoneUsage
      bufferedText = ''
      bufferedThinking = ''
      bufferedTools = []
      bufferedError = null

      if (textToFlush || thinkToFlush || toolsToFlush.length > 0 || errToFlush || doneToFlush) {
        const runningTool = [...toolsToFlush].reverse().find((t) => t.status === 'running')
        if (runningTool) {
          setLiveState((prev) => ({
            streaming: true,
            startedAt: prev.startedAt || Date.now(),
            activeToolName: runningTool.name,
          }))
        }
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== tempAsstId) return m
            let nextContent = m.content + textToFlush
            if (errToFlush) {
              nextContent = nextContent ? `${nextContent}\n\n> ⚠️ ${errToFlush}` : `⚠️ ${errToFlush}`
            }
            return {
              ...m,
              content: nextContent,
              thinking: (m.thinking || '') + thinkToFlush,
              tools: toolsToFlush.length > 0 ? toolsToFlush : m.tools,
              usage: doneToFlush ? usageToFlush : m.usage,
              streaming: doneToFlush || Boolean(errToFlush) ? false : m.streaming,
            }
          }),
        )
      }
      resolveChoreography()
    }

    const scheduleAssistantAfterDelivery = () => {
      if (assistantTimer !== null || assistantInserted || aborted) return
      assistantTimer = window.setTimeout(() => {
        if (aborted) return
        ensureAssistantBubble()
        // Brief gentle breath while Donut shows "正在查看消息…" before fast replies pour out
        breathTimer = window.setTimeout(() => {
          if (aborted) return
          flushBufferedEvents()
        }, THINKING_BREATH_MS)
      }, ASSISTANT_ARRIVE_DELAY_MS)
    }

    // Fallback: if meta takes unusually long (>1.2s), gently show Donut waiting
    assistantTimer = window.setTimeout(() => {
      if (aborted) return
      ensureAssistantBubble()
      breathTimer = window.setTimeout(() => {
        if (!aborted) flushBufferedEvents()
      }, THINKING_BREATH_MS)
    }, 1200)

    try {
      await streamChat(
        { session_id: sid, content: text, images: imageIds, attachments: attachmentIds },
        (ev) => {
          if (ev.type === 'meta') {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sid ? { ...s, title: ev.title, updated_at: Date.now() } : s,
              ),
            )
            // Beat 2 (~580ms): Crossfade "发送中…" -> "✓✓ 已送达"
            const elapsed = Date.now() - sentAt
            const waitDelivery = Math.max(0, MIN_DELIVERY_BEAT_MS - elapsed)
            clearChoreographyTimers()
            deliveryTimer = window.setTimeout(() => {
              if (aborted) return
              markUserDeliveredNow()
              // Beat 3 (+520ms): Donut gently pops in thinking -> Beat 4 (+420ms): stream flushes
              scheduleAssistantAfterDelivery()
            }, waitDelivery)
          } else if (ev.type === 'heartbeat') {
            // Keep-alive signal from backend
          } else if (ev.type === 'thinking') {
            if (!readyToFlush) {
              bufferedThinking += ev.delta
              return
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAsstId
                  ? { ...m, thinking: (m.thinking || '') + ev.delta }
                  : m,
              ),
            )
          } else if (ev.type === 'tool') {
            if (!readyToFlush) {
              const idx = bufferedTools.findIndex((t) => t.id === ev.id)
              if (idx >= 0) {
                bufferedTools[idx] = { id: ev.id, name: ev.name, status: ev.status }
              } else {
                bufferedTools.push({ id: ev.id, name: ev.name, status: ev.status })
              }
              return
            }
            setLiveState((prev) => ({
              streaming: true,
              startedAt: prev.startedAt || Date.now(),
              activeToolName: ev.status === 'running' ? ev.name : null,
            }))
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
            if (!readyToFlush) {
              bufferedText += ev.text
              return
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAsstId ? { ...m, content: m.content + ev.text } : m,
              ),
            )
          } else if (ev.type === 'done') {
            if (!readyToFlush) {
              bufferedDone = true
              bufferedDoneUsage = ev.usage
              return
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAsstId ? { ...m, usage: ev.usage, streaming: false } : m,
              ),
            )
          } else if (ev.type === 'error') {
            if (!readyToFlush) {
              bufferedError = ev.message
              return
            }
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
      // If the response completed very fast, let the calm 3-beat choreography finish gracefully
      if (!readyToFlush && !aborted) {
        await choreographyDone
      }
    } catch (err) {
      aborted = true
      clearChoreographyTimers()
      resolveChoreography()
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : '连接中断'
        if (!deliveredShown) {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempUserId ? { ...m, deliveryStatus: 'failed' } : m)),
          )
        }
        if (!assistantInserted) {
          ensureAssistantBubble({ content: `⚠️ ${msg}`, streaming: false })
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAsstId
                ? { ...m, content: m.content || `⚠️ ${msg}`, streaming: false }
                : m,
            ),
          )
        }
      }
    } finally {
      clearChoreographyTimers()
      if (!aborted && !readyToFlush) {
        flushBufferedEvents()
      }
      if (assistantInserted) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempAsstId ? { ...m, streaming: false } : m)),
        )
      }
      setStreaming(false)
      setLiveState({ streaming: false, startedAt: null, activeToolName: null })
      abortRef.current = null
      refreshStatus()
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
    setProjects([])
    setActiveSessionId(null)
    setActiveProjectId(null)
    setMessages([])
    setCompanionStatus(null)
    setActiveAppId('donut')
    setExternalLaunchUrl(null)
  }

  if (checkingAuth) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
        正在进入…
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
  const activeProject = projects.find((p) => p.id === activeProjectId) || null
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null
  const isMainSession = Boolean(activeSession?.is_main)
  const assistantEmoji = user.assistant_emoji || '🍩'
  const assistantName = user.assistant_name || 'Donut'
  const gatewayOnline = companionStatus ? companionStatus.gateway_online : true
  const mobileDotColor = liveState.streaming
    ? '#f59e0b'
    : gatewayOnline
      ? 'var(--success)'
      : 'var(--danger)'
  const mobileStatusText = liveState.streaming
    ? liveState.activeToolName
      ? '处理中'
      : '思考中'
    : gatewayOnline
      ? '在线'
      : '重连'

  return (
    <div className="h-full flex overflow-hidden relative" style={{ background: 'var(--bg-page)' }}>
      {/* Calm top-center floating toast */}
      {toast && (
        <div
          data-testid="toast-banner"
          className="fixed top-4 left-1/2 z-50 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium animate-toast-in pointer-events-none"
          style={{
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <Check size={13} />
          <span>{toast}</span>
        </div>
      )}

      {/* Pure collapsible left sidebar */}
      <SessionSidebar
        user={user}
        apps={apps}
        activeAppId={activeAppId}
        projects={projects}
        activeProjectId={activeProjectId}
        sessions={sessions}
        activeSessionId={activeSessionId}
        theme={theme}
        desktopOpen={desktopSidebarOpen}
        openMobile={mobileSidebarOpen}
        onToggleDesktop={() => setDesktopSidebarOpen((v) => !v)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onSelectApp={handleSelectApp}
        onSelectMainSession={handleSelectMainSession}
        onNewStandaloneSession={handleNewStandaloneSession}
        onSelectProject={handleSelectProject}
        onNewProjectSession={handleNewProjectSession}
        onCreateProject={() => setProjectModal({ open: true, projectId: null })}
        onEditProject={(pid) => setProjectModal({ open: true, projectId: pid })}
        onSelectSession={handleSelectSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        onSetTheme={setTheme}
        onOpenSettings={(tab) => setSettingsTab(tab)}
        onOpenVault={(tab = 'artifacts') => setVaultModal({ open: true, tab })}
        showInstallApp={!standalone}
        onInstallApp={() => setPwaModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main content area — ZERO top bar on desktop; native-grade sleek bar on mobile */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Whisper-quiet floating sidebar reopen button on desktop when collapsed */}
        {!desktopSidebarOpen && (
          <button
            type="button"
            onClick={() => setDesktopSidebarOpen(true)}
            data-testid="sidebar-expand-btn"
            title="展开侧边栏"
            className="hidden lg:inline-flex items-center justify-center fixed top-3 left-3 z-20 p-2 rounded-xl sidebar-row pressable animate-pop-up cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <PanelLeftOpen size={16} />
          </button>
        )}

        {/* Native-grade mobile top bar — solid surface + z-10 to prevent WebView backdrop-filter bleed */}
        <div
          className="lg:hidden safe-pt shrink-0 relative z-10"
          style={{
            background: 'var(--bg-page)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div className="h-12 px-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              data-testid="mobile-menu-btn"
              aria-label="打开侧边栏"
              className="w-9 h-9 rounded-xl flex items-center justify-center sidebar-row pressable cursor-pointer shrink-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Menu size={19} />
            </button>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-base leading-none shrink-0">
                {activeExternalApp
                  ? activeExternalApp.emoji
                  : activeProject
                    ? activeProject.emoji || '📁'
                    : assistantEmoji}
              </span>
              <span className="text-[14.5px] font-semibold tracking-tight truncate">
                {activeExternalApp
                  ? activeExternalApp.shortName
                  : activeProject
                    ? activeProject.name
                    : assistantName}
              </span>
            </div>

            {activeExternalApp ? (
              <div className="w-9 shrink-0" />
            ) : (
              <button
                type="button"
                onClick={() => setMobileCompanionOpen(true)}
                data-testid="mobile-status-pill"
                aria-label="查看助手状态与动态"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11.5px] font-medium pressable cursor-pointer shrink-0"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    liveState.streaming ? 'animate-soft-breathe' : ''
                  }`}
                  style={{ background: mobileDotColor }}
                />
                <span>{mobileStatusText}</span>
              </button>
            )}
          </div>
        </div>

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
                正在进入 {activeExternalApp.name}…
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex min-w-0 min-h-0 relative">
            <ChatView
              user={user}
              activeProject={activeProject}
              isMainSession={isMainSession}
              messages={messages}
              streaming={streaming}
              onSend={handleSend}
              onStop={handleStop}
              onOpenProjectMemory={(pid) => setProjectModal({ open: true, projectId: pid })}
            />
            <CompanionPanel
              user={user}
              status={companionStatus}
              loading={loadingStatus}
              open={rightPanelOpen}
              mobileOpen={mobileCompanionOpen}
              live={liveState}
              projects={projects}
              activeProject={activeProject}
              canDistill={Boolean(activeProject && activeSessionId && messages.length > 0)}
              distilling={distilling}
              onToggleOpen={() => setRightPanelOpen((v) => !v)}
              onCloseMobile={() => setMobileCompanionOpen(false)}
              onRefresh={refreshStatus}
              onEditProject={(pid) => setProjectModal({ open: true, projectId: pid })}
              onSelectProject={handleSelectProject}
              onDistillActive={handleDistillActiveProject}
              onOpenVault={(tab = 'artifacts') => setVaultModal({ open: true, tab })}
            />
          </div>
        )}
      </div>

      {settingsTab && (
        <SettingsModal
          user={user}
          theme={theme}
          initialTab={settingsTab}
          onSetTheme={setTheme}
          onUserUpdated={(u) => {
            setUser(u)
            refreshStatus()
            showToast('助手设定已更新')
          }}
          onClose={() => setSettingsTab(null)}
        />
      )}

      {projectModal.open && (
        <ProjectModal
          projectId={projectModal.projectId}
          activeSessionId={activeSessionId}
          activeSessionInThisProject={Boolean(
            projectModal.projectId &&
              activeProjectId === projectModal.projectId &&
              activeSessionId &&
              messages.length > 0,
          )}
          onSaved={(saved, created) => {
            if (created) {
              setProjects((prev) => [saved, ...prev])
              setActiveAppId('donut')
              setActiveProjectId(saved.id)
              setActiveSessionId(null)
              setMessages([])
              showToast(`已创建项目「${saved.name}」`)
            } else {
              setProjects((prev) => prev.map((p) => (p.id === saved.id ? saved : p)))
              showToast(`已保存「${saved.name}」记忆`)
            }
            refreshStatus()
          }}
          onDeleted={(deletedId) => {
            setProjects((prev) => prev.filter((p) => p.id !== deletedId))
            setSessions((prev) =>
              prev.map((s) => (s.project_id === deletedId ? { ...s, project_id: null } : s)),
            )
            if (activeProjectId === deletedId) {
              setActiveProjectId(null)
            }
            showToast('项目已归档删除（历史对话已保留）')
            refreshStatus()
          }}
          onDistilled={(projName) => {
            showToast(`已沉淀到「${projName}」记忆`)
            refreshStatus()
          }}
          onClose={() => setProjectModal({ open: false, projectId: null })}
        />
      )}

      {pwaModalOpen && (
        <PwaInstallModal
          canNativeInstall={Boolean(deferredPrompt)}
          isSecureOrigin={window.isSecureContext}
          onTriggerNativeInstall={handleTriggerNativePwaInstall}
          onClose={() => setPwaModalOpen(false)}
        />
      )}

      {vaultModal.open && (
        <VaultModal
          user={user}
          initialTab={vaultModal.tab}
          onChanged={() => refreshStatus()}
          onClose={() => setVaultModal((prev) => ({ ...prev, open: false }))}
        />
      )}
    </div>
  )
}
