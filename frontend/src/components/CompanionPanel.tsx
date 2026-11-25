import { useEffect, useState } from 'react'
import {
  BookOpen,
  Compass,
  FolderKanban,
  Loader2,
  MessageCircle,
  PanelRightClose,
  RefreshCw,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react'
import type { CompanionStatus, ProjectItem, UserProfile } from '../api/client'
import type { VaultTab } from './VaultModal'

export interface LiveStreamState {
  streaming: boolean
  startedAt: number | null
  activeToolName: string | null
}

interface Props {
  user: UserProfile
  status: CompanionStatus | null
  loading: boolean
  open: boolean
  mobileOpen: boolean
  live: LiveStreamState
  projects: ProjectItem[]
  activeProject: ProjectItem | null
  canDistill: boolean
  distilling: boolean
  onToggleOpen: () => void
  onCloseMobile: () => void
  onRefresh: () => void
  onEditProject: (projectId: string) => void
  onSelectProject: (projectId: string) => void
  onDistillActive: () => void
  onOpenVault: (tab?: VaultTab) => void
}

function formatRelativeTime(ts: number | null): string {
  if (!ts) return '刚上线'
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSec < 60) return '刚刚'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} 小时前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function formatLiveTool(name: string): string {
  const low = name.toLowerCase()
  if (low.includes('notion')) return '正在查阅 Notion'
  if (low.includes('memory') || low.includes('wiki')) return '正在翻阅记忆'
  if (low.includes('search') || low.includes('web')) return '正在联网检索'
  if (low.includes('exec') || low.includes('bash') || low.includes('shell'))
    return '正在整理文件'
  if (low.includes('read') || low.includes('write') || low.includes('edit'))
    return '正在整理笔记'
  return `正在处理中`
}

export function CompanionPanel({
  user,
  status,
  loading,
  open,
  mobileOpen,
  live,
  projects,
  activeProject,
  canDistill,
  distilling,
  onToggleOpen,
  onCloseMobile,
  onRefresh,
  onEditProject,
  onSelectProject,
  onDistillActive,
}: Props) {
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    if (!live.streaming || !live.startedAt) {
      setElapsedSec(0)
      return
    }
    setElapsedSec(Math.max(0, Math.floor((Date.now() - live.startedAt) / 1000)))
    const timer = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - live.startedAt!) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [live.streaming, live.startedAt])

  const assistantEmoji = user.assistant_emoji || '🍩'
  const assistantName = user.assistant_name || 'Donut'
  const online = status ? status.gateway_online : true

  let dotColor = online ? 'var(--success)' : 'var(--danger)'
  let presenceText = online ? '在线 · 随时陪聊' : '连接重连中'
  let compactLabel = online ? '在线' : '离线'

  if (live.streaming) {
    dotColor = '#f59e0b'
    if (live.activeToolName) {
      presenceText = `${formatLiveTool(live.activeToolName)}… (${elapsedSec}s)`
      compactLabel = `${formatLiveTool(live.activeToolName)} ${elapsedSec}s`
    } else if (elapsedSec >= 2) {
      presenceText = `正在思考… (${elapsedSec}s)`
      compactLabel = `思考中 ${elapsedSec}s`
    } else {
      presenceText = '正在看你的消息…'
      compactLabel = '响应中'
    }
  }

  const renderCardBody = (isMobile: boolean) => (
    <div className="chat-scroll overflow-y-auto px-5 py-4 space-y-4">
      {/* Contextual Project Card — only shown when relevant */}
      {activeProject ? (
        <div
          data-testid="active-project-card"
          className="p-3.5 rounded-2xl space-y-3 animate-msg-in"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              <span>{activeProject.emoji || '📁'}</span>
              <span className="truncate">{activeProject.name}</span>
            </div>
            <p
              className="text-[12.5px] mt-1 leading-relaxed line-clamp-2"
              style={{ color: 'var(--text-muted)' }}
            >
              {activeProject.summary || '已自动挂载本项目的规范与历史记忆'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (isMobile) onCloseMobile()
                onEditProject(activeProject.id)
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-medium pressable cursor-pointer"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
              }}
            >
              <BookOpen size={13} />
              <span>项目记忆</span>
            </button>
            <button
              type="button"
              disabled={!canDistill || distilling}
              onClick={() => {
                if (isMobile) onCloseMobile()
                onDistillActive()
              }}
              data-testid={isMobile ? 'mobile-distill-project-btn' : 'distill-project-btn'}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-medium pressable cursor-pointer disabled:opacity-40"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              {distilling ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              <span>{distilling ? '沉淀中…' : '一键沉淀'}</span>
            </button>
          </div>
        </div>
      ) : projects.length > 0 ? (
        <div
          data-testid={isMobile ? 'mobile-roaming-projects-card' : 'roaming-projects-card'}
          className="p-3.5 rounded-2xl space-y-2.5 animate-msg-in"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between text-[13px] font-medium">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <Compass size={14} />
              <span>我的项目</span>
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {projects.length} 个
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {projects.slice(0, 5).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (isMobile) onCloseMobile()
                  onSelectProject(p.id)
                }}
                title={p.summary || `进入 ${p.name}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[12.5px] sidebar-row pressable cursor-pointer max-w-full"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>{p.emoji || '📁'}</span>
                <span className="truncate max-w-[120px]">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Today's gentle companionship stats */}
      <div className="grid grid-cols-2 gap-2.5">
        <div
          className="px-3.5 py-3 rounded-2xl"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            今日聊了
          </div>
          <div className="text-[16px] font-semibold mt-1 tabular-nums leading-none">
            {status?.stats.today_turns ?? 0}
            <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
              轮
            </span>
          </div>
        </div>
        <div
          className="px-3.5 py-3 rounded-2xl"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            最近互动
          </div>
          <div className="text-[14px] font-semibold mt-1 truncate leading-tight">
            {formatRelativeTime(status?.stats.last_active_at ?? null)}
          </div>
        </div>
      </div>

      {/* Recent moments — concise & readable */}
      {status && status.activities.length > 0 && (
        <div>
          <div
            className="text-xs font-medium mb-2 px-0.5"
            style={{ color: 'var(--text-muted)' }}
          >
            最近动态
          </div>
          <div className="space-y-2">
            {status.activities.slice(0, isMobile ? 4 : 3).map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl text-[13px]"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {item.kind === 'tool' ? (
                    <Wrench size={13} />
                  ) : item.kind === 'project' ? (
                    <FolderKanban size={13} />
                  ) : item.kind === 'persona' ? (
                    <Sparkles size={13} />
                  ) : (
                    <MessageCircle size={13} />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className="leading-snug break-words"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {item.text}
                  </div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {formatRelativeTime(item.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop: Smooth floating status pill when panel is collapsed */}
      {!open && (
        <button
          type="button"
          onClick={onToggleOpen}
          data-testid="companion-pill-toggle"
          title="展开助手状态"
          className="fixed top-4 right-4 z-20 hidden lg:inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-medium pressable animate-pop-up cursor-pointer"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${live.streaming ? 'animate-soft-breathe' : ''}`}
            style={{ background: dotColor }}
          />
          <span>{assistantName}</span>
          <span style={{ color: 'var(--text-muted)' }}>· {compactLabel}</span>
        </button>
      )}

      {/* Desktop: Top-anchored, compact, airy floating companion card */}
      <div
        className="hidden lg:block h-full shrink-0 overflow-hidden panel-slide"
        style={{
          width: open ? '320px' : '0px',
          opacity: open ? 1 : 0,
        }}
        aria-hidden={!open}
      >
        <aside
          data-testid="companion-panel"
          className="flex flex-col justify-start w-[320px] shrink-0 h-full pt-5 pb-5 pr-5 pl-1.5 select-none"
        >
          <div
            data-testid="companion-floating-card"
            className="max-h-[calc(100dvh-2.5rem)] flex flex-col rounded-3xl overflow-hidden"
            style={{
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {/* Hero Donut Presence Header */}
            <div
              className="px-5 pt-6 pb-5 relative flex flex-col items-center text-center shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div className="absolute top-3.5 right-3.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={onRefresh}
                  title="刷新状态"
                  className="w-7 h-7 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  type="button"
                  onClick={onToggleOpen}
                  title="收起状态卡片"
                  data-testid="companion-collapse-btn"
                  className="w-7 h-7 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <PanelRightClose size={14} />
                </button>
              </div>

              <div
                data-testid="companion-hero-avatar"
                className={`w-20 h-20 rounded-full flex items-center justify-center text-5xl shrink-0 ${
                  live.streaming ? 'donut-ring-active' : ''
                }`}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {assistantEmoji}
              </div>

              <div className="text-[18px] font-semibold tracking-tight mt-3 leading-tight">
                {assistantName}
              </div>

              <div
                className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[13px] font-medium mt-2 max-w-full"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${live.streaming ? 'animate-soft-breathe' : ''}`}
                  style={{ background: dotColor }}
                />
                <span className="truncate">{presenceText}</span>
              </div>
            </div>

            {renderCardBody(false)}
          </div>
        </aside>
      </div>

      {/* Mobile: Native-grade Bottom Sheet for Donut Status, Projects & Activity */}
      <div
        className={`fixed inset-0 z-50 lg:hidden flex flex-col justify-end transition-opacity duration-200 ${
          mobileOpen
            ? 'opacity-100 pointer-events-auto visible'
            : 'opacity-0 pointer-events-none invisible'
        }`}
        aria-hidden={!mobileOpen}
      >
        {mobileOpen && (
          <div className="absolute inset-0 bg-black/40 animate-backdrop-in" onClick={onCloseMobile} />
        )}
        <div
          data-testid="mobile-companion-sheet"
          className="relative z-10 max-h-[82dvh] flex flex-col rounded-t-3xl overflow-hidden safe-pb transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            background: 'var(--bg-sidebar)',
            borderTop: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-md)',
            transform: mobileOpen ? 'translateY(0)' : 'translateY(100%)',
          }}
        >
          {/* Handle bar */}
          <div className="pt-2.5 pb-1 flex justify-center shrink-0">
            <div
              className="w-10 h-1 rounded-full"
              style={{ background: 'var(--border-strong)' }}
            />
          </div>

          <div
            className="px-5 py-3.5 flex items-center justify-between gap-2 shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-3xl shrink-0 ${
                  live.streaming ? 'donut-ring-active' : ''
                }`}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                {assistantEmoji}
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-semibold truncate">{assistantName}</div>
                <div
                  className="flex items-center gap-1.5 text-[13px] mt-0.5 truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${live.streaming ? 'animate-soft-breathe' : ''}`}
                    style={{ background: dotColor }}
                  />
                  <span className="truncate">{presenceText}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onRefresh}
                aria-label="刷新状态"
                className="p-2 rounded-full sidebar-row pressable cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="关闭状态面板"
                className="p-2 rounded-full sidebar-row pressable cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {renderCardBody(true)}
        </div>
      </div>
    </>
  )
}
