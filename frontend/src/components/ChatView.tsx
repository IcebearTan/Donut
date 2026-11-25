import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Sparkles,
  Square,
  Wrench,
  X,
} from 'lucide-react'
import {
  api,
  type ChatMessage,
  type ProjectItem,
  type ToolCallItem,
  type UploadedAttachment,
  type UserProfile,
} from '../api/client'

interface Props {
  user: UserProfile
  activeProject?: ProjectItem | null
  isMainSession?: boolean
  messages: ChatMessage[]
  streaming: boolean
  onSend: (text: string, attachments: UploadedAttachment[]) => void
  onStop: () => void
  onOpenProjectMemory?: (projectId: string) => void
}

const TIME_GAP_MS = 5 * 60 * 1000 // 5 minutes between messages -> show Dot-style divider

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatTimeDivider(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const hm = `${hh}:${mm}`
  if (isSameDay(d, now)) return `今天 ${hm}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, yesterday)) return `昨天 ${hm}`
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

function formatToolLabel(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('notion')) return '正在查询 Notion'
  if (lower.includes('memory') || lower.includes('wiki')) return '正在翻阅记忆'
  if (lower.includes('search') || lower.includes('web') || lower.includes('fetch'))
    return '正在联网检索'
  if (lower.includes('exec') || lower.includes('bash') || lower.includes('shell'))
    return '正在整理与生成文件'
  if (lower.includes('read') || lower.includes('write') || lower.includes('file'))
    return '正在读写文件'
  return `正在调用 ${name}`
}

function CodeBlock({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const raw = String(children ?? '').replace(/\n$/, '')
  const lang = className?.replace(/^language-/, '') || ''

  function handleCopy() {
    navigator.clipboard?.writeText(raw).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div
      className="my-3 rounded-xl overflow-hidden text-xs"
      style={{
        background: 'var(--bg-code)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 text-[11px]"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)',
        }}
      >
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:opacity-80 cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto leading-relaxed m-0">
        <code className="font-mono">{raw}</code>
      </pre>
    </div>
  )
}

function ThinkingBlock({
  thinking,
  isStreaming,
  elapsedSec,
}: {
  thinking: string
  isStreaming?: boolean
  elapsedSec?: number
}) {
  const [open, setOpen] = useState(false)
  if (!thinking) return null

  return (
    <div
      className="mb-2.5 rounded-xl overflow-hidden text-xs"
      style={{
        background: 'var(--bg-think)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left cursor-pointer"
        style={{ color: 'var(--text-secondary)' }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Sparkles size={13} />
        <span className="font-medium">
          {isStreaming
            ? `已思考 ${elapsedSec ?? 0} 秒…`
            : elapsedSec && elapsedSec > 0
              ? `思考过程（${elapsedSec} 秒）`
              : '思考过程'}
        </span>
      </button>
      {open && (
        <div
          className="px-3.5 pb-3 pt-1 whitespace-pre-wrap leading-relaxed"
          style={{
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {thinking}
        </div>
      )}
    </div>
  )
}

function LiveWaitingBanner({
  assistantName,
  startedAt,
  runningTool,
  inlineAfterText = false,
}: {
  assistantName: string
  startedAt: number
  runningTool?: ToolCallItem
  inlineAfterText?: boolean
}) {
  const [elapsedSec, setElapsedSec] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  // Key ONLY by semantic phase (NOT by elapsedSec!) so the label never jumps/flickers every second
  let phaseKey = 'viewing'
  let label = inlineAfterText ? `${assistantName} 正在继续处理` : `${assistantName} 正在查看消息…`
  let showSec = false
  let suffix = ''

  if (runningTool) {
    phaseKey = `tool:${runningTool.name}`
    label = formatToolLabel(runningTool.name)
    showSec = elapsedSec >= 1
  } else if (elapsedSec >= 15) {
    phaseKey = 'complex'
    label = '正在处理较复杂任务'
    showSec = true
    suffix = ' · 连接正常'
  } else if (elapsedSec >= 2 || inlineAfterText) {
    phaseKey = inlineAfterText ? 'continuing' : 'thinking'
    label = inlineAfterText ? '正在整理下一步' : '已思考'
    showSec = elapsedSec >= 2
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs ${
        inlineAfterText ? 'mt-2.5' : 'animate-asst-arrive'
      }`}
      style={{
        background: 'var(--bg-think)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-secondary)',
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0 animate-soft-breathe"
        style={{ background: '#f59e0b' }}
      />
      <span key={phaseKey} className="animate-receipt-in inline-flex items-center gap-1">
        <span>{label}</span>
        {showSec && (
          <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {phaseKey === 'thinking' ? `${elapsedSec} 秒…` : `(${elapsedSec}s)`}
          </span>
        )}
        {suffix && <span style={{ color: 'var(--text-muted)' }}>{suffix}</span>}
      </span>
    </div>
  )
}

function AssistantBubble({ msg, user }: { msg: ChatMessage; user: UserProfile }) {
  const hasContent = Boolean(msg.content)
  const hasThinking = Boolean(msg.thinking)
  const tools = msg.tools || []
  const runningTool = tools.find((t) => t.status === 'running')
  const assistantEmoji = user.assistant_emoji || '🍩'
  const assistantName = user.assistant_name || 'Donut'

  const [liveSec, setLiveSec] = useState(() =>
    msg.startedAt ? Math.max(0, Math.floor((Date.now() - msg.startedAt) / 1000)) : 0,
  )

  useEffect(() => {
    if (!msg.streaming || !msg.startedAt) return
    const timer = window.setInterval(() => {
      setLiveSec(Math.max(0, Math.floor((Date.now() - msg.startedAt!) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [msg.streaming, msg.startedAt])

  const finalSec =
    msg.usage?.elapsed_ms != null
      ? Math.max(1, Math.round(msg.usage.elapsed_ms / 1000))
      : liveSec

  return (
    <div className="flex gap-2.5 sm:gap-3 max-w-3xl w-full mx-auto animate-asst-arrive">
      <div
        className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-sm mt-0.5 select-none"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {assistantEmoji}
      </div>
      <div className="flex-1 min-w-0">
        {hasThinking && (
          <ThinkingBlock
            thinking={msg.thinking!}
            isStreaming={msg.streaming && !hasContent}
            elapsedSec={msg.streaming ? liveSec : finalSec}
          />
        )}

        {tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tools.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {t.status === 'running' ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Check size={11} style={{ color: 'var(--success)' }} />
                )}
                <Wrench size={11} className="opacity-70" />
                <span>{t.status === 'running' ? formatToolLabel(t.name) : t.name}</span>
              </span>
            ))}
          </div>
        )}

        {hasContent ? (
          <>
            <div className="md-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children }) => <>{children}</>,
                  a: ({ href, children, ...rest }) => {
                    if (
                      href &&
                      (href.startsWith('/portal-api/files/') ||
                        href.startsWith('/portal-api/vault/download/'))
                    ) {
                      return (
                        <a
                          href={href}
                          download
                          className="my-2 inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium no-underline pressable"
                          style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            textDecoration: 'none',
                          }}
                        >
                          <FileText size={16} className="shrink-0 opacity-80" />
                          <span className="truncate max-w-[240px] sm:max-w-[360px]">
                            {children}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs shrink-0"
                            style={{
                              background: 'var(--accent)',
                              color: 'var(--accent-contrast)',
                            }}
                          >
                            <Download size={11} />
                            <span>下载</span>
                          </span>
                        </a>
                      )
                    }
                    return (
                      <a href={href} target="_blank" rel="noreferrer" {...rest}>
                        {children}
                      </a>
                    )
                  },
                  code: ({ className, children, ...rest }) => {
                    const isBlock = Boolean(className) || String(children).includes('\n')
                    if (isBlock) {
                      return <CodeBlock className={className}>{children}</CodeBlock>
                    }
                    return (
                      <code className={className} {...rest}>
                        {children}
                      </code>
                    )
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
            {msg.streaming && runningTool && (
              <LiveWaitingBanner
                assistantName={assistantName}
                startedAt={msg.startedAt || msg.created_at}
                runningTool={runningTool}
                inlineAfterText
              />
            )}
            {!msg.streaming && !hasThinking && msg.usage?.elapsed_ms && msg.usage.elapsed_ms >= 3000 && (
              <div
                className="mt-1.5 inline-flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                <Clock size={10} />
                <span className="tabular-nums">已思考 {finalSec} 秒</span>
              </div>
            )}
          </>
        ) : msg.streaming ? (
          <LiveWaitingBanner
            assistantName={assistantName}
            startedAt={msg.startedAt || msg.created_at}
            runningTool={runningTool}
          />
        ) : null}
      </div>
    </div>
  )
}

function UserBubble({ msg, showReceipt }: { msg: ChatMessage; showReceipt: boolean }) {
  const status = msg.deliveryStatus || 'delivered'
  const isFresh = msg.deliveryStatus !== undefined

  return (
    <div
      className={`flex justify-end max-w-3xl w-full mx-auto ${isFresh ? 'animate-user-send' : ''}`}
    >
      <div className="max-w-[86%] sm:max-w-[75%] flex flex-col items-end gap-1">
        {msg.images && msg.images.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {msg.images.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt="上传图片"
                className="max-h-48 max-w-[220px] rounded-xl object-cover"
                style={{ border: '1px solid var(--border-subtle)' }}
              />
            ))}
          </div>
        )}
        {msg.content && (
          <div
            className="px-3.5 sm:px-4 py-2.5 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed whitespace-pre-wrap break-word"
            style={{
              background: 'var(--bg-user-bubble)',
              color: 'var(--text-user-bubble)',
            }}
          >
            {msg.content}
          </div>
        )}
        {showReceipt && (
          <div
            key={status}
            className="flex items-center gap-1 text-[11px] px-1 select-none animate-receipt-in"
            style={{
              color: status === 'failed' ? 'var(--danger)' : 'var(--text-muted)',
            }}
          >
            {status === 'sending' ? (
              <>
                <Loader2 size={10} className="animate-spin" />
                <span>发送中…</span>
              </>
            ) : status === 'failed' ? (
              <span>发送失败</span>
            ) : (
              <>
                <CheckCheck size={12} />
                <span>已送达</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ChatView({
  user,
  activeProject,
  isMainSession,
  messages,
  streaming,
  onSend,
  onStop,
  onOpenProjectMemory,
}: Props) {
  const [input, setInput] = useState('')
  const [pendingFiles, setPendingFiles] = useState<UploadedAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)

  const assistantEmoji = user.assistant_emoji || '🍩'
  const assistantName = user.assistant_name || 'Donut'

  const quickPrompts = activeProject
    ? [
        `回顾一下「${activeProject.name}」目前的背景与进展`,
        `帮我梳理「${activeProject.name}」接下来最关键的 3 步`,
        `把今天的想法记进「${activeProject.name}」的项目记忆里`,
      ]
    : user.id === 'her'
      ? [
          '帮我制定一份这周的学习与复习计划',
          '我发一张题目或笔记截图，帮我梳理重点',
          '最近有点累，陪我聊两句轻松的',
        ]
      : [
          '帮我看看我各个项目目前的重点和下一步建议',
          '帮我搜一下我 Notion 里最近更新的页面',
          '梳理今天最重要的 3 件待办',
        ]

  // Auto-grow textarea height smoothly WITHOUT showing a scrollbar on single/short lines
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const maxH = 160
    el.style.height = 'auto'
    const nextH = Math.min(el.scrollHeight, maxH)
    el.style.height = `${nextH}px`
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'
  }, [input])

  // Smart stick-to-bottom on single native scroll container (zero nested scrollbars)
  const lastMsg = messages[messages.length - 1]
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !nearBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, lastMsg?.content, lastMsg?.thinking, lastMsg?.deliveryStatus])

  function handleChatScroll() {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    try {
      const added: UploadedAttachment[] = []
      for (const file of list.slice(0, 10 - pendingFiles.length)) {
        const res = await api.uploadVaultFile(file)
        added.push(res)
      }
      setPendingFiles((prev) => [...prev, ...added].slice(0, 10))
    } catch (e) {
      alert(e instanceof Error ? e.message : '文件上传失败')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function submit() {
    if (streaming) return
    const text = input.trim()
    if (!text && pendingFiles.length === 0) return
    nearBottomRef.current = true
    onSend(text, pendingFiles)
    setInput('')
    setPendingFiles([])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files: File[] = []
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      handleFiles(files)
    }
  }

  // Find index of the latest user message to display the clean Dot-style delivery receipt
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8 text-center animate-msg-in">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-4"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {activeProject ? activeProject.emoji || '📁' : assistantEmoji}
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
            {activeProject ? activeProject.name : `你好，${user.display_name}`}
          </h2>
          <p className="text-sm mt-1.5 max-w-md" style={{ color: 'var(--text-muted)' }}>
            {activeProject
              ? activeProject.summary ||
                `已自动挂载「${activeProject.name}」的规范与历史记忆，直接接着往下推进吧。`
              : isMainSession
                ? `我是 ${assistantName}。在主对话里随口聊什么都可以，需要时我会自动穿梭翻阅你的项目记忆。`
                : `我是你的专属陪伴助手 ${assistantName}。随时聊想法、管日程，或直接发截图给我看。`}
          </p>
          {activeProject && onOpenProjectMemory && (
            <button
              type="button"
              onClick={() => onOpenProjectMemory(activeProject.id)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <BookOpen size={12} />
              <span>查看 / 编辑项目记忆</span>
            </button>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-7 w-full max-w-2xl">
            {quickPrompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onSend(p, [])}
                className="text-left p-3.5 rounded-2xl text-xs sm:text-sm leading-snug sidebar-row pressable cursor-pointer"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleChatScroll}
          className="chat-scroll flex-1 min-h-0 overflow-y-auto overscroll-none"
        >
          <div className="px-4 sm:px-6 pt-4 lg:pt-8 pb-6 space-y-4 sm:space-y-5">
            {messages.map((m, idx) => {
              const prev = idx > 0 ? messages[idx - 1] : null
              const showTimeDivider =
                !prev ||
                m.created_at - prev.created_at >= TIME_GAP_MS ||
                !isSameDay(new Date(m.created_at), new Date(prev.created_at))

              return (
                <div key={m.id} className="space-y-3.5 sm:space-y-4">
                  {showTimeDivider && (
                    <div className="flex items-center justify-center py-1 select-none">
                      <span
                        className="text-[11px] px-2.5 py-0.5 rounded-full"
                        style={{
                          color: 'var(--text-muted)',
                          background: 'var(--bg-elevated)',
                        }}
                      >
                        {formatTimeDivider(m.created_at)}
                      </span>
                    </div>
                  )}
                  {m.role === 'user' ? (
                    <UserBubble msg={m} showReceipt={idx === lastUserIdx} />
                  ) : (
                    <AssistantBubble msg={m} user={user} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 px-3 sm:px-6 pt-1.5 safe-pb sm:pb-5">
        <div
          className="max-w-3xl mx-auto rounded-[24px] p-2 sm:p-2.5 transition-all duration-150 focus-within:border-[var(--text-muted)]"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-1.5 pb-2.5">
              {pendingFiles.map((f) =>
                f.is_image ? (
                  <div key={f.id} className="relative group">
                    <img
                      src={f.url}
                      alt={f.name}
                      className="w-14 h-14 rounded-lg object-cover"
                      style={{ border: '1px solid var(--border-subtle)' }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPendingFiles((prev) => prev.filter((x) => x.id !== f.id))
                      }
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center cursor-pointer"
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--accent-contrast)',
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <div
                    key={f.id}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-xl text-xs max-w-[210px]"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <FileText size={13} className="shrink-0 opacity-75" />
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingFiles((prev) => prev.filter((x) => x.id !== f.id))
                      }
                      className="p-0.5 rounded-full hover:opacity-80 cursor-pointer shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ),
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.md,.json,.zip"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading || streaming || pendingFiles.length >= 10}
              onClick={() => fileRef.current?.click()}
              title="上传图片或文件（支持 PDF / Excel / Word / 截图粘贴）"
              data-testid="chat-upload-btn"
              className="p-2 rounded-xl sidebar-row pressable disabled:opacity-40 cursor-pointer shrink-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                activeProject
                  ? `在「${activeProject.name}」中给 ${assistantName} 发消息…`
                  : `给 ${assistantName} 发消息，或直接丢入发票 / PDF / 表格…`
              }
              className="flex-1 resize-none overflow-y-hidden bg-transparent outline-none text-[15px] leading-relaxed py-1.5 max-h-40"
              style={{ color: 'var(--text-primary)' }}
            />

            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                title="停止生成"
                className="p-2 rounded-xl shrink-0 pressable cursor-pointer"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!input.trim() && pendingFiles.length === 0}
                onClick={submit}
                title="发送"
                className="p-2 rounded-xl shrink-0 pressable disabled:opacity-30 cursor-pointer"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
