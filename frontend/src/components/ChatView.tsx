import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { StickToBottom } from 'use-stick-to-bottom'
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCheck,
  Clock,
  Copy,
  ImagePlus,
  Loader2,
  Sparkles,
  Square,
  Wrench,
  X,
} from 'lucide-react'
import { api, type ChatMessage, type ToolCallItem, type UserProfile } from '../api/client'

interface Props {
  user: UserProfile
  messages: ChatMessage[]
  streaming: boolean
  onSend: (text: string, imageIds: string[], imageUrls: string[]) => void
  onStop: () => void
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
}: {
  assistantName: string
  startedAt: number
  runningTool?: ToolCallItem
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

  let statusText = `${assistantName} 正在查看消息…`
  if (runningTool) {
    statusText = `${formatToolLabel(runningTool.name)}… (${elapsedSec}s)`
  } else if (elapsedSec >= 15) {
    statusText = `已思考 ${elapsedSec} 秒 · 正在处理较复杂任务（连接正常）`
  } else if (elapsedSec >= 2) {
    statusText = `已思考 ${elapsedSec} 秒…`
  }

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs"
      style={{
        background: 'var(--bg-think)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-secondary)',
      }}
    >
      <Loader2 size={12} className="animate-spin shrink-0" />
      <span>{statusText}</span>
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
    <div className="flex gap-3 max-w-3xl w-full mx-auto">
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
            {!msg.streaming && !hasThinking && msg.usage?.elapsed_ms && msg.usage.elapsed_ms >= 3000 && (
              <div
                className="mt-1.5 inline-flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                <Clock size={10} />
                <span>已思考 {finalSec} 秒</span>
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

  return (
    <div className="flex justify-end max-w-3xl w-full mx-auto">
      <div className="max-w-[85%] sm:max-w-[75%] flex flex-col items-end gap-1">
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
            className="px-4 py-2.5 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed whitespace-pre-wrap break-word"
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
            className="flex items-center gap-1 text-[11px] px-1 select-none"
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

export function ChatView({ user, messages, streaming, onSend, onStop }: Props) {
  const [input, setInput] = useState('')
  const [pendingImages, setPendingImages] = useState<Array<{ id: string; url: string }>>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const assistantEmoji = user.assistant_emoji || '🍩'
  const assistantName = user.assistant_name || 'Donut'

  const quickPrompts =
    user.id === 'her'
      ? [
          '帮我制定一份这周的学习与复习计划',
          '我发一张题目或笔记截图，帮我梳理重点',
          '最近有点累，陪我聊两句轻松的',
        ]
      : [
          '帮我搜一下我 Notion 里最近更新的页面',
          '帮我梳理今天最重要的 3 件待办',
          '用一句话总结我这周的安排建议',
        ]

  // Auto-grow textarea height smoothly
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [input])

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    setUploading(true)
    try {
      const added: Array<{ id: string; url: string }> = []
      for (const file of list.slice(0, 4 - pendingImages.length)) {
        const res = await api.uploadImage(file)
        added.push(res)
      }
      setPendingImages((prev) => [...prev, ...added].slice(0, 4))
    } catch (e) {
      alert(e instanceof Error ? e.message : '图片上传失败')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function submit() {
    if (streaming) return
    const text = input.trim()
    if (!text && pendingImages.length === 0) return
    onSend(
      text,
      pendingImages.map((i) => i.id),
      pendingImages.map((i) => i.url),
    )
    setInput('')
    setPendingImages([])
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
      if (item.kind === 'file' && item.type.startsWith('image/')) {
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
    <div className="flex-1 flex flex-col min-h-0 relative">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-4"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {assistantEmoji}
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
            你好，{user.display_name}
          </h2>
          <p className="text-sm mt-1.5 max-w-md" style={{ color: 'var(--text-muted)' }}>
            我是你的专属陪伴助手 {assistantName}。随时聊想法、管日程，或直接发截图给我看。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-7 w-full max-w-2xl">
            {quickPrompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onSend(p, [], [])}
                className="text-left p-3.5 rounded-2xl text-xs sm:text-sm leading-snug transition-colors cursor-pointer"
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
        <StickToBottom
          className="flex-1 overflow-y-auto px-4 py-6"
          resize="smooth"
          initial="instant"
        >
          <StickToBottom.Content className="space-y-5 pb-4">
            {messages.map((m, idx) => {
              const prev = idx > 0 ? messages[idx - 1] : null
              const showTimeDivider =
                !prev ||
                m.created_at - prev.created_at >= TIME_GAP_MS ||
                !isSameDay(new Date(m.created_at), new Date(prev.created_at))

              return (
                <div key={m.id} className="space-y-4">
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
          </StickToBottom.Content>
        </StickToBottom>
      )}

      {/* Composer */}
      <div className="shrink-0 px-3 sm:px-4 pb-4 pt-2">
        <div
          className="max-w-3xl mx-auto rounded-2xl p-2.5 transition-colors"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1.5 pb-2.5">
              {pendingImages.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={img.url}
                    alt="预览"
                    className="w-14 h-14 rounded-lg object-cover"
                    style={{ border: '1px solid var(--border-subtle)' }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPendingImages((prev) => prev.filter((x) => x.id !== img.id))
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
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading || streaming || pendingImages.length >= 4}
              onClick={() => fileRef.current?.click()}
              title="上传图片（支持 Ctrl+V 直接粘贴截图）"
              className="p-2 rounded-xl transition-colors disabled:opacity-40 cursor-pointer shrink-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={`给 ${assistantName} 发消息…（Shift+Enter 换行，支持粘贴截图）`}
              className="flex-1 resize-none bg-transparent outline-none text-[15px] leading-relaxed py-1.5 max-h-44"
              style={{ color: 'var(--text-primary)' }}
            />

            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                title="停止生成"
                className="p-2 rounded-xl shrink-0 cursor-pointer"
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
                disabled={!input.trim() && pendingImages.length === 0}
                onClick={submit}
                title="发送"
                className="p-2 rounded-xl shrink-0 transition-opacity disabled:opacity-30 cursor-pointer"
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
