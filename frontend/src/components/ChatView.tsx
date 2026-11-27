import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Paperclip,
  Sparkles,
  Square,
  Wallet,
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
  sessionKey: string
  user: UserProfile
  activeProject?: ProjectItem | null
  isMainSession?: boolean
  messages: ChatMessage[]
  streaming: boolean
  onSend: (text: string, attachments: UploadedAttachment[]) => void
  onStop: () => void
  onOpenProjectMemory?: (projectId: string) => void
  /** Opens the 0-token quick Ledger capture; absent when the Ledger extension is off. */
  onOpenQuickLedger?: () => void
}

const TIME_GAP_MS = 5 * 60 * 1000 // 5 minutes between messages -> show Dot-style divider
const INITIAL_VISIBLE_MESSAGES = 30
const LOAD_MORE_STEP = 30
const BUBBLE_SPLIT_RE = /\s*<!--\s*donut-bubble\s*-->\s*/g
const REMARK_PLUGINS = [remarkGfm]
const ATTACHMENT_TOKEN_RE = /📎\s*(?:`([^`\n]+)`|"([^"\n]+)"|“([^”\n]+)”)/g

interface DraftEntry {
  text: string
  pendingFiles: UploadedAttachment[]
}

const DRAFT_STORAGE_KEY = 'portal_chat_drafts_v1'
const draftMemoryMap = new Map<string, DraftEntry>()
let draftsHydrated = false

function hydrateDraftsFromStorage() {
  if (draftsHydrated) return
  draftsHydrated = true
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, DraftEntry>
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object') {
          draftMemoryMap.set(k, {
            text: typeof v.text === 'string' ? v.text : '',
            pendingFiles: Array.isArray(v.pendingFiles) ? v.pendingFiles : [],
          })
        }
      }
    }
  } catch {
    // ignore storage errors
  }
}

function loadDraft(key: string): DraftEntry {
  hydrateDraftsFromStorage()
  const hit = draftMemoryMap.get(key)
  if (hit) return hit
  return { text: '', pendingFiles: [] }
}

function saveDraft(key: string, entry: DraftEntry) {
  hydrateDraftsFromStorage()
  if (!entry.text && entry.pendingFiles.length === 0) {
    draftMemoryMap.delete(key)
  } else {
    draftMemoryMap.set(key, entry)
  }
  try {
    const obj: Record<string, DraftEntry> = {}
    for (const [k, v] of draftMemoryMap.entries()) {
      obj[k] = v
    }
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // ignore quota errors
  }
}

function parseUserAttachments(content: string): { cleanText: string; files: string[] } {
  if (!content || !content.includes('📎')) {
    return { cleanText: content, files: [] }
  }
  const files: string[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  ATTACHMENT_TOKEN_RE.lastIndex = 0
  while ((match = ATTACHMENT_TOKEN_RE.exec(content)) !== null) {
    const name = (match[1] || match[2] || match[3] || '').trim()
    if (name && !seen.has(name)) {
      seen.add(name)
      files.push(name)
    }
  }
  if (files.length === 0) return { cleanText: content, files: [] }
  const cleanText = content
    .replace(ATTACHMENT_TOKEN_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { cleanText, files }
}

function getFileExt(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx <= 0 || idx === name.length - 1) return ''
  return name.slice(idx + 1).toLowerCase()
}

function AttachmentIcon({ ext }: { ext: string }) {
  if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileSpreadsheet size={15} className="shrink-0" />
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive size={15} className="shrink-0" />
  if (['py', 'js', 'ts', 'tsx', 'json', 'md', 'html', 'css', 'sh', 'yaml', 'yml'].includes(ext)) {
    return <FileCode size={15} className="shrink-0" />
  }
  return <FileText size={15} className="shrink-0" />
}

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

function formatToolAction(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('notion')) {
    if (lower.includes('create') && lower.includes('comment')) return '添加 Notion 评论'
    if (lower.includes('create')) return '新建 Notion 页面'
    if (lower.includes('update')) return '更新 Notion 内容'
    if (lower.includes('fetch') || lower.includes('get')) return '读取 Notion 详情'
    if (lower.includes('search') || lower.includes('query')) return '检索 Notion'
    if (lower.includes('move')) return '移动 Notion 页面'
    return '操作 Notion'
  }
  if (lower.includes('memory') || lower.includes('wiki')) return '翻阅长期记忆'
  if (lower.includes('search') || lower.includes('web') || lower.includes('fetch'))
    return '联网检索'
  if (lower.includes('exec') || lower.includes('bash') || lower.includes('shell'))
    return '运行整理脚本'
  if (lower.includes('read')) return '读取工作区文件'
  if (lower.includes('write') || lower.includes('edit')) return '写入与更新笔记/技能'
  if (lower.includes('file')) return '读写文件'
  return name
}

function formatToolLabel(name: string): string {
  return `正在${formatToolAction(name)}`
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

const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  pre: ({ children }) => <>{children}</>,
  a: ({ href, children, ...rest }) => {
    if (
      href &&
      (href.startsWith('/portal-api/files/') || href.startsWith('/portal-api/vault/download/'))
    ) {
      return (
        <a
          href={href}
          download
          className="my-2 inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium no-underline pressable"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)',
            textDecoration: 'none',
          }}
        >
          <FileText size={16} className="shrink-0 opacity-80" />
          <span className="truncate max-w-[220px] sm:max-w-[340px]">{children}</span>
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
}

const MarkdownBubble = memo(function MarkdownBubble({
  text,
  isFirst,
}: {
  text: string
  isFirst: boolean
}) {
  return (
    <div
      data-testid="assistant-bubble"
      className={`max-w-[92%] sm:max-w-[84%] px-4 sm:px-4.5 py-3 rounded-2xl overflow-x-auto ${
        isFirst ? 'rounded-tl-sm' : 'animate-asst-arrive'
      }`}
      style={{
        background: 'var(--bg-assistant-bubble)',
        border: '1px solid var(--border-assistant-bubble)',
        boxShadow: 'var(--shadow-bubble)',
      }}
    >
      <div className="md-body">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
          {text}
        </ReactMarkdown>
      </div>
    </div>
  )
})

const ThinkingBlock = memo(function ThinkingBlock({
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
      className="mb-2.5 rounded-2xl overflow-hidden text-[13px] max-w-full"
      style={{
        background: 'var(--bg-think)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left cursor-pointer"
        style={{ color: 'var(--text-secondary)' }}
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <Sparkles size={14} />
        <span className="font-medium tabular-nums">
          {isStreaming
            ? `已思考 ${elapsedSec ?? 0} 秒…`
            : elapsedSec && elapsedSec > 0
              ? `思考过程（${elapsedSec} 秒）`
              : '思考过程'}
        </span>
      </button>
      {open && (
        <div
          className="px-4 pb-3.5 pt-2 whitespace-pre-wrap leading-relaxed"
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
})

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
    label = inlineAfterText ? '正在继续思考与整理' : '已思考'
    showSec = elapsedSec >= 2
  }

  return (
    <div
      data-testid="thinking-bubble"
      className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl rounded-tl-sm text-[14.5px] leading-snug ${
        inlineAfterText ? 'mt-2.5 animate-msg-in' : 'animate-asst-arrive'
      }`}
      style={{
        background: 'var(--bg-assistant-bubble)',
        border: '1px solid var(--border-assistant-bubble)',
        boxShadow: 'var(--shadow-bubble)',
        color: 'var(--text-secondary)',
      }}
    >
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0 animate-soft-breathe"
        style={{ background: '#f59e0b' }}
      />
      <span key={phaseKey} className="animate-receipt-in inline-flex items-center gap-1.5">
        <span>{label}</span>
        {showSec && (
          <span className="tabular-nums text-[13.5px]" style={{ color: 'var(--text-muted)' }}>
            {phaseKey === 'thinking' ? `${elapsedSec} 秒…` : `(${elapsedSec}s)`}
          </span>
        )}
        {suffix && (
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {suffix}
          </span>
        )}
      </span>
      <span className="inline-flex items-center gap-1 ml-0.5" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
    </div>
  )
}

const ToolStepsSummary = memo(function ToolStepsSummary({
  tools,
  streaming,
}: {
  tools: ToolCallItem[]
  streaming?: boolean
}) {
  const [open, setOpen] = useState(false)
  if (tools.length === 0) return null

  const doneCount = tools.filter((t) => t.status !== 'running').length
  const running = [...tools].reverse().find((t) => t.status === 'running')
  const latest = running || tools[tools.length - 1]

  return (
    <div className="mb-2 max-w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sidebar-row pressable cursor-pointer"
        style={{
          background: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {running || streaming ? (
          <Loader2 size={12} className="animate-spin shrink-0" style={{ color: '#f59e0b' }} />
        ) : (
          <Check size={12} className="shrink-0" style={{ color: 'var(--success)' }} />
        )}
        <span className="truncate max-w-[260px] sm:max-w-[360px]">
          {running
            ? `第 ${tools.length} 步 · ${formatToolLabel(running.name)}`
            : tools.length === 1
              ? `已${formatToolAction(latest.name)}`
              : `已完成 ${doneCount} 步操作`}
        </span>
        {open ? (
          <ChevronDown size={12} className="shrink-0 opacity-70" />
        ) : (
          <ChevronRight size={12} className="shrink-0 opacity-70" />
        )}
      </button>

      {open && (
        <div
          className="mt-1.5 p-2.5 rounded-2xl space-y-1.5 text-xs max-w-md animate-msg-in"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {tools.map((t, idx) => (
            <div
              key={t.id}
              className="flex items-center gap-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t.status === 'running' ? (
                <Loader2 size={11} className="animate-spin shrink-0" style={{ color: '#f59e0b' }} />
              ) : (
                <Check size={11} className="shrink-0" style={{ color: 'var(--success)' }} />
              )}
              <Wrench size={11} className="opacity-60 shrink-0" />
              <span className="truncate">
                {idx + 1}. {t.status === 'running' ? formatToolLabel(t.name) : formatToolAction(t.name)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

const AssistantBubble = memo(function AssistantBubble({
  msg,
  assistantName,
}: {
  msg: ChatMessage
  assistantName: string
}) {
  const bubbleSegments = useMemo(() => {
    if (!msg.content) return []
    return msg.content
      .split(BUBBLE_SPLIT_RE)
      .map((seg) => seg.trim())
      .filter(Boolean)
  }, [msg.content])

  const hasContent = bubbleSegments.length > 0
  const hasThinking = Boolean(msg.thinking)
  const tools = msg.tools || []
  const runningTool = tools.find((t) => t.status === 'running')

  const [liveSec, setLiveSec] = useState(() =>
    msg.startedAt ? Math.max(0, Math.floor((Date.now() - msg.startedAt) / 1000)) : 0,
  )
  // Keep showing the thinking bubble after Donut sends its first planning sentence and pauses to work/reason
  const [waitingBetweenBatches, setWaitingBetweenBatches] = useState(false)

  useEffect(() => {
    if (!msg.streaming || !msg.startedAt) return
    const timer = window.setInterval(() => {
      setLiveSec(Math.max(0, Math.floor((Date.now() - msg.startedAt!) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [msg.streaming, msg.startedAt])

  useEffect(() => {
    if (!msg.streaming || !hasContent) {
      setWaitingBetweenBatches(false)
      return
    }
    setWaitingBetweenBatches(false)
    const pauseTimer = window.setTimeout(() => {
      setWaitingBetweenBatches(true)
    }, 650)
    return () => window.clearTimeout(pauseTimer)
  }, [msg.streaming, hasContent, msg.content])

  const finalSec =
    msg.usage?.elapsed_ms != null
      ? Math.max(1, Math.round(msg.usage.elapsed_ms / 1000))
      : liveSec

  const showPostTextThinking =
    Boolean(msg.streaming) &&
    hasContent &&
    (Boolean(runningTool) || waitingBetweenBatches)

  return (
    <div className="flex flex-col items-start max-w-3xl w-full mx-auto animate-asst-arrive">
      <div className="w-full min-w-0 flex flex-col items-start">
        {hasThinking && (
          <ThinkingBlock
            thinking={msg.thinking!}
            isStreaming={msg.streaming && !hasContent}
            elapsedSec={msg.streaming ? liveSec : finalSec}
          />
        )}

        {tools.length > 0 && <ToolStepsSummary tools={tools} streaming={msg.streaming} />}

        {hasContent ? (
          <>
            <div className="flex flex-col items-start gap-2.5 w-full">
              {bubbleSegments.map((seg, idx) => (
                <MarkdownBubble key={idx} text={seg} isFirst={idx === 0} />
              ))}
            </div>
            {showPostTextThinking && (
              <LiveWaitingBanner
                assistantName={assistantName}
                startedAt={msg.startedAt || msg.created_at}
                runningTool={runningTool}
                inlineAfterText
              />
            )}
            {!msg.streaming && !hasThinking && msg.usage?.elapsed_ms && msg.usage.elapsed_ms >= 3000 && (
              <div
                className="mt-1.5 ml-1 inline-flex items-center gap-1 text-[11px]"
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
})

const UserBubble = memo(function UserBubble({
  msg,
  showReceipt,
}: {
  msg: ChatMessage
  showReceipt: boolean
}) {
  const status = msg.deliveryStatus || 'delivered'
  const isFresh = msg.deliveryStatus !== undefined
  const { cleanText, files } = useMemo(() => parseUserAttachments(msg.content || ''), [msg.content])

  return (
    <div
      className={`flex justify-end max-w-3xl w-full mx-auto ${isFresh ? 'animate-user-send' : ''}`}
    >
      <div className="max-w-[86%] sm:max-w-[75%] flex flex-col items-end gap-1.5">
        {msg.images && msg.images.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {msg.images.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt="上传图片"
                loading="lazy"
                className="max-h-48 max-w-[220px] rounded-xl object-cover"
                style={{ border: '1px solid var(--border-subtle)' }}
              />
            ))}
          </div>
        )}
        {cleanText && (
          <div
            data-testid="user-bubble"
            className="px-4 py-2.5 rounded-2xl rounded-tr-sm text-[15px] leading-relaxed whitespace-pre-wrap break-word"
            style={{
              background: 'var(--bg-user-bubble)',
              color: 'var(--text-user-bubble)',
              boxShadow: 'var(--shadow-user-bubble)',
            }}
          >
            {cleanText}
          </div>
        )}
        {files.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5 max-w-full">
            {files.map((fileName) => {
              const ext = getFileExt(fileName)
              return (
                <a
                  key={fileName}
                  href={`/portal-api/vault/download/inbox/${encodeURIComponent(fileName)}`}
                  download={fileName}
                  data-testid="user-attachment-chip"
                  title={`点击下载 ${fileName}`}
                  className="group inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-2xl text-[12.5px] no-underline sidebar-row pressable max-w-[260px] sm:max-w-[300px]"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: 'var(--shadow-sm)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span
                    className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <AttachmentIcon ext={ext} />
                  </span>
                  <span className="min-w-0 flex flex-col leading-tight">
                    <span className="truncate font-medium text-[12.5px]">{fileName}</span>
                    {ext && (
                      <span
                        className="text-[10px] uppercase tracking-wide mt-0.5"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {ext} 文件
                      </span>
                    )}
                  </span>
                  <Download
                    size={12}
                    className="shrink-0 opacity-45 group-hover:opacity-90 transition-opacity ml-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  />
                </a>
              )
            })}
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
})

const ChatComposer = memo(function ChatComposer({
  sessionKey,
  assistantName,
  activeProjectName,
  streaming,
  onSubmit,
  onStop,
  onOpenQuickLedger,
}: {
  sessionKey: string
  assistantName: string
  activeProjectName?: string
  streaming: boolean
  onSubmit: (text: string, files: UploadedAttachment[]) => void
  onStop: () => void
  onOpenQuickLedger?: () => void
}) {
  const [input, setInput] = useState(() => loadDraft(sessionKey).text)
  const [pendingFiles, setPendingFiles] = useState<UploadedAttachment[]>(
    () => loadDraft(sessionKey).pendingFiles,
  )
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const lastCompositionEndRef = useRef(0)
  const currentKeyRef = useRef(sessionKey)
  const latestInputRef = useRef(input)
  const latestFilesRef = useRef(pendingFiles)
  latestInputRef.current = input
  latestFilesRef.current = pendingFiles

  // Restore saved draft when switching between chat sessions (without leaking previous session's text)
  useEffect(() => {
    if (currentKeyRef.current === sessionKey) return
    currentKeyRef.current = sessionKey
    const saved = loadDraft(sessionKey)
    setInput(saved.text)
    setPendingFiles(saved.pendingFiles)
  }, [sessionKey])

  function updateInput(nextText: string) {
    setInput(nextText)
    saveDraft(currentKeyRef.current, { text: nextText, pendingFiles: latestFilesRef.current })
  }

  function updatePendingFiles(
    updater: (prev: UploadedAttachment[]) => UploadedAttachment[],
  ) {
    setPendingFiles((prev) => {
      const next = updater(prev)
      saveDraft(currentKeyRef.current, { text: latestInputRef.current, pendingFiles: next })
      return next
    })
  }

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

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    try {
      const added: UploadedAttachment[] = []
      const remaining = Math.max(0, 10 - latestFilesRef.current.length)
      for (const file of list.slice(0, remaining)) {
        const res = await api.uploadVaultFile(file)
        added.push(res)
      }
      updatePendingFiles((prev) => [...prev, ...added].slice(0, 10))
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
    onSubmit(text, pendingFiles)
    setInput('')
    setPendingFiles([])
    saveDraft(currentKeyRef.current, { text: '', pendingFiles: [] })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    const native = e.nativeEvent as KeyboardEvent
    // Guard against macOS Chinese IME committing Latin text with Enter (Safari fires compositionend right before keydown)
    const recentlyComposed = Date.now() - lastCompositionEndRef.current < 150
    if (
      native.isComposing ||
      isComposingRef.current ||
      native.keyCode === 229 ||
      e.keyCode === 229 ||
      recentlyComposed
    ) {
      return
    }
    e.preventDefault()
    submit()
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

  return (
    <div
      className="shrink-0 px-3 sm:px-6 pt-2 safe-pb sm:pb-5 relative z-10"
      style={{ background: 'var(--composer-fade-bg)' }}
    >
      <div
        data-testid="capsule-composer"
        className="max-w-3xl mx-auto rounded-[28px] px-2 py-1.5 sm:px-2.5 sm:py-2 transition-all duration-150 focus-within:border-[var(--text-muted)]"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pt-1">
            {pendingFiles.map((f) =>
              f.is_image ? (
                <div key={f.id} className="relative group">
                  <img
                    src={f.url}
                    alt={f.name}
                    className="w-14 h-14 rounded-xl object-cover"
                    style={{ border: '1px solid var(--border-subtle)' }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updatePendingFiles((prev) => prev.filter((x) => x.id !== f.id))
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
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full text-xs max-w-[210px]"
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
                      updatePendingFiles((prev) => prev.filter((x) => x.id !== f.id))
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
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading || streaming || pendingFiles.length >= 10}
            onClick={() => fileRef.current?.click()}
            title="上传图片或文件（支持 Ctrl+V 直接粘贴截图）"
            data-testid="chat-upload-btn"
            className="w-9 h-9 rounded-full flex items-center justify-center sidebar-row pressable disabled:opacity-40 cursor-pointer shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
          </button>
          {onOpenQuickLedger && (
            <button
              type="button"
              onClick={onOpenQuickLedger}
              title="随手记一笔（0 Token 离线速记 · Alt+L）"
              data-testid="chat-quick-ledger-btn"
              className="w-9 h-9 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer shrink-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Wallet size={17} />
            </button>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => updateInput(e.target.value)}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
              lastCompositionEndRef.current = Date.now()
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              activeProjectName
                ? `在「${activeProjectName}」里继续聊…`
                : `给 ${assistantName} 发消息…`
            }
            className="flex-1 resize-none overflow-y-hidden bg-transparent outline-none text-[15px] leading-relaxed py-1.5 px-1 max-h-40"
            style={{ color: 'var(--text-primary)' }}
          />

          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              title="停止生成"
              data-testid="chat-stop-btn"
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 pressable cursor-pointer"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!input.trim() && pendingFiles.length === 0}
              onClick={submit}
              title="发送"
              data-testid="chat-send-btn"
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 pressable disabled:opacity-25 cursor-pointer"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <ArrowUp size={18} strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

export function ChatView({
  sessionKey,
  user,
  activeProject,
  isMainSession,
  messages,
  streaming,
  onSend,
  onStop,
  onOpenProjectMemory,
  onOpenQuickLedger,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_MESSAGES)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const onSendRef = useRef(onSend)
  onSendRef.current = onSend

  const assistantEmoji = user.assistant_emoji || '🍩'
  const assistantName = user.assistant_name || 'Donut'

  // Reset rendered window on session switch so long main chats always open instantaneously
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_MESSAGES)
    nearBottomRef.current = true
  }, [sessionKey])

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

  // Smart stick-to-bottom on single native scroll container
  const lastMsg = messages[messages.length - 1]
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !nearBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [sessionKey, messages.length, lastMsg?.content, lastMsg?.thinking, lastMsg?.deliveryStatus])

  function handleChatScroll() {
    const el = scrollRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96
  }

  function handleLoadOlder() {
    const el = scrollRef.current
    const prevHeight = el?.scrollHeight || 0
    const prevTop = el?.scrollTop || 0
    nearBottomRef.current = false
    setVisibleCount((prev) => prev + LOAD_MORE_STEP)
    window.requestAnimationFrame(() => {
      if (!el) return
      const diff = el.scrollHeight - prevHeight
      el.scrollTop = prevTop + diff
    })
  }

  const handleComposerSubmit = useCallback((text: string, files: UploadedAttachment[]) => {
    nearBottomRef.current = true
    onSendRef.current(text, files)
  }, [])

  const startIdx = Math.max(0, messages.length - visibleCount)
  const visibleMessages = startIdx > 0 ? messages.slice(startIdx) : messages
  const hiddenCount = startIdx

  // Find index of the latest user message inside visibleMessages
  let lastUserIdx = -1
  for (let i = visibleMessages.length - 1; i >= 0; i--) {
    if (visibleMessages[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pt-20 lg:pt-0 pb-8 text-center animate-msg-in">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-4xl mb-4"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-sm)',
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
          <div className="px-4 sm:px-6 pt-[88px] lg:pt-8 pb-6 space-y-4 sm:space-y-5">
            {hiddenCount > 0 && (
              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  data-testid="load-older-messages-btn"
                  onClick={handleLoadOlder}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium sidebar-row pressable cursor-pointer"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <History size={12} />
                  <span>查看更早的 {hiddenCount} 条消息</span>
                </button>
              </div>
            )}

            {visibleMessages.map((m, idx) => {
              const prev = idx > 0 ? visibleMessages[idx - 1] : null
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
                    <AssistantBubble msg={m} assistantName={assistantName} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ChatComposer
        sessionKey={sessionKey}
        assistantName={assistantName}
        activeProjectName={activeProject?.name}
        streaming={streaming}
        onSubmit={handleComposerSubmit}
        onStop={onStop}
        onOpenQuickLedger={onOpenQuickLedger}
      />
    </div>
  )
}
