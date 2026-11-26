import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Menu, PanelLeftOpen } from 'lucide-react'
import {
  api,
  attachSessionStream,
  streamChat,
  type ActiveRunSnapshot,
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
import { ProjectModal } from './components/ProjectModal'
import { PwaInstallModal } from './components/PwaInstallModal'
import { VaultView } from './components/VaultView'
import { WorkbenchView } from './components/WorkbenchView'
import { ProfileSettingsView, type SettingsSection } from './components/ProfileSettingsView'

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
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null)
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
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('overview')
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
  const activeSessionIdRef = useRef<string | null>(null)
  const streamingSessionIdRef = useRef<string | null>(null)
  const liveMessagesCacheRef = useRef<Record<string, ChatMessage[]>>({})

  activeSessionIdRef.current = activeSessionId
  streamingSessionIdRef.current = streamingSessionId

  const setActiveSessionAndRef = useCallback((id: string | null) => {
    activeSessionIdRef.current = id
    setActiveSessionId(id)
  }, [])

  const updateSessionMessages = useCallback(
    (sid: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      const prev = liveMessagesCacheRef.current[sid] || []
      const next = updater(prev)
      liveMessagesCacheRef.current[sid] = next
      if (activeSessionIdRef.current === sid) {
        setMessages(next)
      }
    },
    [],
  )

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

  const reattachActiveRun = useCallback(
    (sid: string, baseMessages: ChatMessage[], run: ActiveRunSnapshot) => {
      if (streamingSessionIdRef.current === sid) return
      const liveAsstId = run.assistant_message_id || `live-${sid}`
      const runningTool = [...(run.tools || [])].reverse().find((t) => t.status === 'running')
      const liveMsg: ChatMessage = {
        id: liveAsstId,
        role: 'assistant',
        content: run.content || '',
        thinking: run.thinking || '',
        tools: run.tools || [],
        created_at: run.started_at || Date.now(),
        startedAt: run.started_at || Date.now(),
        streaming: true,
      }
      const initialMsgs = [...baseMessages.filter((m) => m.id !== liveAsstId), liveMsg]
      liveMessagesCacheRef.current[sid] = initialMsgs
      if (activeSessionIdRef.current === sid) {
        setMessages(initialMsgs)
      }

      const controller = new AbortController()
      abortRef.current = controller
      streamingSessionIdRef.current = sid
      setStreamingSessionId(sid)
      setLiveState({
        streaming: true,
        startedAt: run.started_at || Date.now(),
        activeToolName: runningTool?.name || null,
      })

      let pendingLiveText = ''
      let pendingLiveThinking = ''
      let rafId: number | null = null
      let sawIdle = false

      const flushLiveFrame = () => {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId)
          rafId = null
        }
        const addText = pendingLiveText
        const addThink = pendingLiveThinking
        pendingLiveText = ''
        pendingLiveThinking = ''
        if (!addText && !addThink) return
        updateSessionMessages(sid, (prev) =>
          prev.map((m) =>
            m.id === liveAsstId
              ? {
                  ...m,
                  content: addText ? m.content + addText : m.content,
                  thinking: addThink ? (m.thinking || '') + addThink : m.thinking,
                }
              : m,
          ),
        )
      }

      const scheduleLiveFrame = () => {
        if (rafId !== null) return
        rafId = window.requestAnimationFrame(() => {
          rafId = null
          flushLiveFrame()
        })
      }

      attachSessionStream(
        sid,
        (ev) => {
          if (ev.type === 'idle') {
            sawIdle = true
            return
          }
          if (ev.type === 'snapshot') {
            const snap = ev.run
            const rTool = [...(snap.tools || [])].reverse().find((t) => t.status === 'running')
            setLiveState({
              streaming: !snap.finished,
              startedAt: snap.started_at || Date.now(),
              activeToolName: rTool?.name || null,
            })
            updateSessionMessages(sid, (prev) =>
              prev.map((m) =>
                m.id === liveAsstId
                  ? {
                      ...m,
                      content: snap.content || '',
                      thinking: snap.thinking || '',
                      tools: snap.tools || [],
                      streaming: !snap.finished,
                    }
                  : m,
              ),
            )
          } else if (ev.type === 'delta') {
            pendingLiveText += ev.text
            scheduleLiveFrame()
          } else if (ev.type === 'thinking') {
            pendingLiveThinking += ev.delta
            scheduleLiveFrame()
          } else if (ev.type === 'tool') {
            flushLiveFrame()
            setLiveState((prev) => ({
              streaming: true,
              startedAt: prev.startedAt || Date.now(),
              activeToolName: ev.status === 'running' ? ev.name : null,
            }))
            updateSessionMessages(sid, (prev) =>
              prev.map((m) => {
                if (m.id !== liveAsstId) return m
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
          } else if (ev.type === 'title') {
            setSessions((prev) =>
              prev.map((s) => (s.id === sid ? { ...s, title: ev.title } : s)),
            )
          } else if (ev.type === 'done') {
            flushLiveFrame()
            updateSessionMessages(sid, (prev) =>
              prev.map((m) =>
                m.id === liveAsstId ? { ...m, usage: ev.usage, streaming: false } : m,
              ),
            )
          } else if (ev.type === 'error') {
            flushLiveFrame()
            updateSessionMessages(sid, (prev) =>
              prev.map((m) =>
                m.id === liveAsstId
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
        .catch(() => {
          // ignore abort / transient disconnect
        })
        .finally(async () => {
          flushLiveFrame()
          updateSessionMessages(sid, (prev) =>
            prev.map((m) => (m.id === liveAsstId ? { ...m, streaming: false } : m)),
          )
          if (streamingSessionIdRef.current === sid) {
            streamingSessionIdRef.current = null
            setStreamingSessionId(null)
            setLiveState({ streaming: false, startedAt: null, activeToolName: null })
            abortRef.current = null
          }
          if (sawIdle) {
            try {
              const latest = await api.getMessages(sid)
              liveMessagesCacheRef.current[sid] = latest.messages
              if (activeSessionIdRef.current === sid) {
                setMessages(latest.messages)
              }
            } catch {
              // ignore
            }
          }
          refreshStatus()
        })
    },
    [refreshStatus, updateSessionMessages],
  )

  const openSessionById = useCallback(
    async (id: string, projectId: string | null) => {
      setActiveAppId('donut')
      setActiveSessionAndRef(id)
      setActiveProjectId(projectId)

      // If this session is actively streaming in memory, jump straight back to its live buffer!
      if (streamingSessionIdRef.current === id && liveMessagesCacheRef.current[id]) {
        setMessages(liveMessagesCacheRef.current[id])
        return
      }

      try {
        const res = await api.getMessages(id)
        if (activeSessionIdRef.current !== id) return
        if (res.active_run && !res.active_run.finished) {
          reattachActiveRun(id, res.messages, res.active_run)
        } else {
          liveMessagesCacheRef.current[id] = res.messages
          setMessages(res.messages)
        }
      } catch {
        if (activeSessionIdRef.current === id) {
          setMessages([])
        }
      }
    },
    [reattachActiveRun, setActiveSessionAndRef],
  )

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
      setActiveSessionAndRef(initial.id)
      setActiveProjectId(initial.project_id || null)
      const msgRes = await api.getMessages(initial.id)
      if (msgRes.active_run && !msgRes.active_run.finished) {
        reattachActiveRun(initial.id, msgRes.messages, msgRes.active_run)
      } else {
        liveMessagesCacheRef.current[initial.id] = msgRes.messages
        setMessages(msgRes.messages)
      }
    } else {
      setActiveSessionAndRef(null)
      setActiveProjectId(null)
      setMessages([])
    }
    api.getStatus().then(setCompanionStatus).catch(() => {})
  }, [reattachActiveRun, setActiveSessionAndRef])

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
    const target = sessions.find((s) => s.id === id)
    await openSessionById(id, target?.project_id || null)
  }

  async function handleSelectMainSession() {
    const mainSess = sessions.find((s) => Boolean(s.is_main))
    if (mainSess) {
      await openSessionById(mainSess.id, null)
    } else {
      setActiveAppId('donut')
      setActiveProjectId(null)
      setActiveSessionAndRef(null)
      setMessages([])
    }
  }

  function handleNewStandaloneSession() {
    setActiveAppId('donut')
    setActiveProjectId(null)
    setActiveSessionAndRef(null)
    setMessages([])
  }

  async function handleSelectProject(projectId: string) {
    const projSessions = sessions.filter((s) => s.project_id === projectId && !s.is_main)
    if (projSessions.length > 0) {
      await openSessionById(projSessions[0].id, projectId)
    } else {
      setActiveAppId('donut')
      setActiveProjectId(projectId)
      setActiveSessionAndRef(null)
      setMessages([])
    }
  }

  function handleNewProjectSession(projectId: string) {
    setActiveAppId('donut')
    setActiveProjectId(projectId)
    setActiveSessionAndRef(null)
    setMessages([])
  }

  async function handleRenameSession(id: string, title: string) {
    await api.renameSession(id, title)
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)))
  }

  async function handleMoveSession(id: string, projectId: string | null) {
    if (streamingSessionIdRef.current === id) return
    try {
      const res = await api.moveSessionToProject(id, projectId)
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, project_id: res.project_id, updated_at: res.session.updated_at } : s,
        ),
      )
      if (activeSessionId === id) {
        setActiveProjectId(res.project_id)
      }
      if (projectId) {
        const proj = projects.find((p) => p.id === projectId)
        showToast(`已移入「${proj?.name || '项目'}」`)
      } else {
        showToast('已移出项目')
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '移动对话失败')
    }
  }

  async function handleAutoTitleSession(id: string) {
    try {
      const res = await api.autoTitleSession(id)
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: res.title } : s)))
      showToast(`已更新标题：${res.title}`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '标题提炼失败')
    }
  }

  async function handleDeleteSession(id: string) {
    if (streamingSessionIdRef.current === id) {
      showToast('该对话正在回复中，请先停止生成再删除')
      return
    }
    await api.deleteSession(id)
    delete liveMessagesCacheRef.current[id]
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (activeSessionId === id) {
        const fallback = next[0] || null
        setActiveSessionAndRef(fallback?.id || null)
        setActiveProjectId(fallback?.project_id || null)
        if (fallback) {
          api.getMessages(fallback.id).then((r) => {
            liveMessagesCacheRef.current[fallback.id] = r.messages
            if (activeSessionIdRef.current === fallback.id) setMessages(r.messages)
          }).catch(() => setMessages([]))
        } else {
          setMessages([])
        }
      }
      return next
    })
  }

  async function handleDistillActiveProject() {
    if (!activeProjectId || !activeSessionId || distilling || streamingSessionId === activeSessionId) return
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
    if (streamingSessionIdRef.current) {
      showToast('Donut 正在处理上一条任务，可先切回去查看或等待完成')
      return
    }
    let sid = activeSessionId
    if (!sid) {
      const created = await api.createSession('新对话', activeProjectId)
      sid = created.session.id
      setSessions((prev) => [created.session, ...prev])
      setActiveSessionAndRef(sid)
      liveMessagesCacheRef.current[sid] = []
    } else if (!liveMessagesCacheRef.current[sid]) {
      liveMessagesCacheRef.current[sid] = messages
    }

    const runSid = sid
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
    updateSessionMessages(runSid, (prev) => [
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
    streamingSessionIdRef.current = runSid
    setStreamingSessionId(runSid)

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

    // Coalesce high-frequency streaming deltas to at most 1 React state update per animation frame
    let pendingLiveText = ''
    let pendingLiveThinking = ''
    let rafId: number | null = null

    const flushLiveFrame = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
        rafId = null
      }
      const addText = pendingLiveText
      const addThink = pendingLiveThinking
      pendingLiveText = ''
      pendingLiveThinking = ''
      if (!addText && !addThink) return
      updateSessionMessages(runSid, (prev) =>
        prev.map((m) =>
          m.id === tempAsstId
            ? {
                ...m,
                content: addText ? m.content + addText : m.content,
                thinking: addThink ? (m.thinking || '') + addThink : m.thinking,
              }
            : m,
        ),
      )
    }

    const scheduleLiveFrame = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        flushLiveFrame()
      })
    }

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
      updateSessionMessages(runSid, (prev) =>
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
        updateSessionMessages(runSid, (prev) => [
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
        updateSessionMessages(runSid, (prev) =>
          prev.map((m) => (m.id === tempAsstId ? { ...m, ...patch } : m)),
        )
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
        updateSessionMessages(runSid, (prev) =>
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
        { session_id: runSid, content: text, images: imageIds, attachments: attachmentIds },
        (ev) => {
          if (ev.type === 'meta') {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === runSid ? { ...s, title: ev.title, updated_at: Date.now() } : s,
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
            pendingLiveThinking += ev.delta
            scheduleLiveFrame()
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
            flushLiveFrame()
            setLiveState((prev) => ({
              streaming: true,
              startedAt: prev.startedAt || Date.now(),
              activeToolName: ev.status === 'running' ? ev.name : null,
            }))
            updateSessionMessages(runSid, (prev) =>
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
            pendingLiveText += ev.text
            scheduleLiveFrame()
          } else if (ev.type === 'title') {
            setSessions((prev) =>
              prev.map((s) => (s.id === runSid ? { ...s, title: ev.title } : s)),
            )
          } else if (ev.type === 'done') {
            if (!readyToFlush) {
              bufferedDone = true
              bufferedDoneUsage = ev.usage
              return
            }
            flushLiveFrame()
            updateSessionMessages(runSid, (prev) =>
              prev.map((m) =>
                m.id === tempAsstId ? { ...m, usage: ev.usage, streaming: false } : m,
              ),
            )
          } else if (ev.type === 'error') {
            if (!readyToFlush) {
              bufferedError = ev.message
              return
            }
            flushLiveFrame()
            updateSessionMessages(runSid, (prev) =>
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
          updateSessionMessages(runSid, (prev) =>
            prev.map((m) => (m.id === tempUserId ? { ...m, deliveryStatus: 'failed' } : m)),
          )
        }
        if (!assistantInserted) {
          ensureAssistantBubble({ content: `⚠️ ${msg}`, streaming: false })
        } else {
          updateSessionMessages(runSid, (prev) =>
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
      flushLiveFrame()
      if (!aborted && !readyToFlush) {
        flushBufferedEvents()
      }
      if (assistantInserted) {
        updateSessionMessages(runSid, (prev) =>
          prev.map((m) => (m.id === tempAsstId ? { ...m, streaming: false } : m)),
        )
      }
      if (streamingSessionIdRef.current === runSid) {
        streamingSessionIdRef.current = null
        setStreamingSessionId(null)
        setLiveState({ streaming: false, startedAt: null, activeToolName: null })
        abortRef.current = null
      }
      refreshStatus()
    }
  }

  function handleStop() {
    const sid = streamingSessionIdRef.current
    abortRef.current?.abort()
    if (sid) {
      api.stopSessionRun(sid).catch(() => {})
    }
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
    abortRef.current?.abort()
    await api.logout().catch(() => {})
    setUser(null)
    setSessions([])
    setProjects([])
    setActiveSessionAndRef(null)
    setActiveProjectId(null)
    setStreamingSessionId(null)
    streamingSessionIdRef.current = null
    liveMessagesCacheRef.current = {}
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
        streamingSessionId={streamingSessionId}
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
        onMoveSession={handleMoveSession}
        onAutoTitleSession={handleAutoTitleSession}
        onDeleteSession={handleDeleteSession}
        onSetTheme={setTheme}
        onOpenSettings={(sec) => {
          setSettingsSection(sec)
          setActiveAppId('settings')
        }}
        onOpenWorkbench={() => setActiveAppId('workbench')}
        onOpenVault={() => setActiveAppId('vault')}
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

        {/* Native-grade mobile top bar:
            - Chat view ('donut'): taller, mathematically centered larger Donut hero avatar, borderless top-down gradient fade
            - Full pages ('vault' / 'skills' / 'settings' / external app): crisp borderless/minimal header with page title */}
        {activeAppId !== 'donut' ? (
          <div
            className="lg:hidden safe-pt shrink-0 relative z-10"
            style={{
              background: 'var(--bg-page)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div className="h-12 px-3 grid grid-cols-[1fr_auto_1fr] items-center">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                data-testid="mobile-menu-btn"
                aria-label="打开侧边栏"
                className="justify-self-start w-9 h-9 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Menu size={19} />
              </button>

              <div className="justify-self-center flex items-center gap-1.5 min-w-0">
                {activeExternalApp ? (
                  <>
                    <span className="text-base leading-none shrink-0">{activeExternalApp.emoji}</span>
                    <span className="text-[14.5px] font-semibold tracking-tight truncate">
                      {activeExternalApp.shortName}
                    </span>
                  </>
                ) : (
                  <span className="text-[15px] font-semibold tracking-tight truncate">
                    {activeAppId === 'workbench'
                      ? '工作台'
                      : activeAppId === 'vault'
                        ? '我的文件仓'
                        : '个人主页与设置'}
                  </span>
                )}
              </div>

              <div />
            </div>
          </div>
        ) : (
          <header
            data-testid="mobile-gradient-header"
            className="lg:hidden absolute top-0 inset-x-0 z-20 safe-pt pb-5 pointer-events-none"
            style={{ background: 'var(--header-fade-bg)' }}
          >
            <div className="px-3 pt-2 min-h-[66px] grid grid-cols-[1fr_auto_1fr] items-center">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                data-testid="mobile-menu-btn"
                aria-label="打开侧边栏"
                className="justify-self-start pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <Menu size={18} />
              </button>

              <button
                type="button"
                onClick={() => setMobileCompanionOpen(true)}
                data-testid="mobile-center-hero"
                aria-label="查看助手状态与动态"
                className="justify-self-center pointer-events-auto flex flex-col items-center gap-0.5 pressable cursor-pointer min-w-0"
              >
                <span
                  data-testid="mobile-hero-avatar"
                  className={`w-11 h-11 rounded-full flex items-center justify-center text-2xl leading-none shrink-0 ${
                    liveState.streaming ? 'donut-ring-active' : ''
                  }`}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  {activeProject ? activeProject.emoji || '📁' : assistantEmoji}
                </span>
                <span
                  className="text-[11.5px] font-medium tracking-tight truncate max-w-[140px] leading-tight"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {activeProject ? activeProject.name : assistantName}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMobileCompanionOpen(true)}
                data-testid="mobile-status-pill"
                aria-label="查看助手状态与动态"
                className="justify-self-end pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium pressable cursor-pointer shrink-0"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-sm)',
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
            </div>
          </header>
        )}

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
        ) : activeAppId === 'workbench' ? (
          <WorkbenchView
            user={user}
            onOpenVault={() => setActiveAppId('vault')}
            onToast={showToast}
            onChanged={() => refreshStatus()}
          />
        ) : activeAppId === 'vault' ? (
          <VaultView user={user} onChanged={() => refreshStatus()} />
        ) : activeAppId === 'settings' ? (
          <ProfileSettingsView
            user={user}
            theme={theme}
            initialSection={settingsSection}
            showInstallApp={!standalone}
            onSetTheme={setTheme}
            onUserUpdated={(u) => {
              setUser(u)
              refreshStatus()
              showToast('个人与助手设定已更新')
            }}
            onNavigateVault={() => setActiveAppId('vault')}
            onTeachInChat={() => handleSelectMainSession()}
            onChanged={() => refreshStatus()}
            onInstallApp={() => setPwaModalOpen(true)}
            onLogout={handleLogout}
          />
        ) : (
          <div className="flex-1 flex min-w-0 min-h-0 relative">
            <ChatView
              sessionKey={activeSessionId || 'new'}
              user={user}
              activeProject={activeProject}
              isMainSession={isMainSession}
              messages={messages}
              streaming={Boolean(activeSessionId && streamingSessionId === activeSessionId)}
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
            />
          </div>
        )}
      </div>

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
              setActiveSessionAndRef(null)
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
    </div>
  )
}
