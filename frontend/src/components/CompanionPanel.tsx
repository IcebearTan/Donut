import { useEffect, useState } from 'react'
import {
  Activity,
  BookOpen,
  Compass,
  FolderArchive,
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
  if (low.includes('notion')) return '正在查询 Notion'
  if (low.includes('memory') || low.includes('wiki')) return '正在翻阅记忆'
  if (low.includes('search') || low.includes('web')) return '正在联网检索'
  if (low.includes('read') || low.includes('write') || low.includes('edit'))
    return '正在读写项目记忆'
  return `正在调用 ${name}`
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
  onOpenVault,
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
  let presenceText = online ? '在线 · 待命中' : '连接重连中'
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
      presenceText = '正在查看消息…'
      compactLabel = '响应中'
    }
  }

  const renderCardBody = (isMobile: boolean) => (
    <div className="flex-1 overflow-y-auto px-4 lg:px-3.5 py-3.5 space-y-4">
      {/* M2 Context Card: Active Project OR Cross-Project Roaming ("游龙") */}
      {activeProject ? (
        <div
          data-testid="active-project-card"
          className="p-3 rounded-xl space-y-2.5 animate-msg-in"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
          }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span>{activeProject.emoji || '📁'}</span>
              <span className="truncate">{activeProject.name}</span>
            </div>
            <p
              className="text-[11px] mt-1 leading-relaxed line-clamp-2"
              style={{ color: 'var(--text-muted)' }}
            >
              {activeProject.summary || '已自动挂载本项目的 BRIEF 与 MEMORY'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (isMobile) onCloseMobile()
                onEditProject(activeProject.id)
              }}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 lg:py-1.5 rounded-lg text-xs lg:text-[11px] font-medium pressable cursor-pointer"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
              }}
            >
              <BookOpen size={12} />
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
              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 lg:py-1.5 rounded-lg text-xs lg:text-[11px] font-medium pressable cursor-pointer disabled:opacity-40"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              {distilling ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              <span>{distilling ? '沉淀中…' : '一键沉淀'}</span>
            </button>
          </div>
        </div>
      ) : projects.length > 0 ? (
        <div
          data-testid={isMobile ? 'mobile-roaming-projects-card' : 'roaming-projects-card'}
          className="p-3 rounded-xl space-y-2 animate-msg-in"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
              <Compass size={12} />
              <span>跨项目游龙已就绪</span>
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{projects.length} 个</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {projects.slice(0, 6).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (isMobile) onCloseMobile()
                  onSelectProject(p.id)
                }}
                title={p.summary || `进入 ${p.name}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 lg:px-2 lg:py-1 rounded-lg text-xs lg:text-[11px] sidebar-row pressable cursor-pointer max-w-full"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>{p.emoji || '📁'}</span>
                <span className="truncate max-w-[110px]">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Self-Evolving Skills & Isolated File Vault */}
      <div>
        <div
          className="text-[11px] font-medium mb-2 px-0.5"
          style={{ color: 'var(--text-muted)' }}
        >
          自进化能力与文件仓
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid={isMobile ? 'mobile-skills-card-btn' : 'skills-card-btn'}
            onClick={() => {
              if (isMobile) onCloseMobile()
              onOpenVault('skills')
            }}
            className="text-left px-3 lg:px-2.5 py-2 rounded-xl sidebar-row pressable cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <Sparkles size={11} />
              <span>已掌握技能</span>
            </div>
            <div className="text-sm font-semibold mt-0.5 tabular-nums">
              {status?.stats.skills_count ?? 0}
              <span className="text-[11px] font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                项
              </span>
            </div>
          </button>
          <button
            type="button"
            data-testid={isMobile ? 'mobile-vault-card-btn' : 'vault-card-btn'}
            onClick={() => {
              if (isMobile) onCloseMobile()
              onOpenVault('artifacts')
            }}
            className="text-left px-3 lg:px-2.5 py-2 rounded-xl sidebar-row pressable cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <FolderArchive size={11} />
              <span>隔离文件仓</span>
            </div>
            <div className="text-sm font-semibold mt-0.5 tabular-nums">
              {status?.stats.vault_files_count ?? 0}
              <span className="text-[11px] font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                个
              </span>
            </div>
          </button>
        </div>

        {status?.skills && status.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {status.skills.slice(0, 4).map((sk) => (
              <button
                key={sk.id}
                type="button"
                onClick={() => {
                  if (isMobile) onCloseMobile()
                  onOpenVault('skills')
                }}
                title={sk.description || sk.name}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] sidebar-row pressable cursor-pointer max-w-full"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Sparkles size={10} className="shrink-0 opacity-70" />
                <span className="truncate max-w-[104px]">{sk.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Connection status */}
      <div>
        <div
          className="text-[11px] font-medium mb-2 px-0.5"
          style={{ color: 'var(--text-muted)' }}
        >
          连接状态
        </div>
        <div className="space-y-1.5">
          {(status?.connections || [
            { id: 'engine', label: 'OpenClaw · DeepSeek', online: true },
          ]).map((conn) => (
            <div
              key={conn.id}
              className="flex items-center justify-between px-3 lg:px-2.5 py-2 rounded-xl text-xs"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="truncate">{conn.label}</span>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: conn.online ? 'var(--success)' : 'var(--danger)',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Today's pulse */}
      <div>
        <div
          className="text-[11px] font-medium mb-2 px-0.5"
          style={{ color: 'var(--text-muted)' }}
        >
          今日状态
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div
            className="px-3 lg:px-2.5 py-2 rounded-xl"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              今日对话
            </div>
            <div className="text-sm font-semibold mt-0.5">
              {status?.stats.today_turns ?? 0}
              <span
                className="text-[11px] font-normal ml-1"
                style={{ color: 'var(--text-muted)' }}
              >
                轮
              </span>
            </div>
          </div>
          <div
            className="px-3 lg:px-2.5 py-2 rounded-xl"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              最近活跃
            </div>
            <div className="text-[12.5px] font-medium mt-1 truncate">
              {formatRelativeTime(status?.stats.last_active_at ?? null)}
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity timeline */}
      <div>
        <div
          className="flex items-center gap-1.5 text-[11px] font-medium mb-2 px-0.5"
          style={{ color: 'var(--text-muted)' }}
        >
          <Activity size={11} />
          <span>最近动态</span>
        </div>

        {!status || status.activities.length === 0 ? (
          <div
            className="px-3 py-5 rounded-xl text-center text-xs"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            发一条消息，这里会记录 {assistantName} 的最近动态
          </div>
        ) : (
          <div className="space-y-1.5">
            {status.activities.slice(0, isMobile ? 5 : 3).map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 px-3 lg:px-2.5 py-2 rounded-xl text-xs"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {item.kind === 'tool' ? (
                    <Wrench size={12} />
                  ) : item.kind === 'project' ? (
                    <FolderKanban size={12} />
                  ) : item.kind === 'persona' ? (
                    <Sparkles size={12} />
                  ) : (
                    <MessageCircle size={12} />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className="leading-snug break-words"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {item.text}
                  </div>
                  <div
                    className="text-[10.5px] mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {formatRelativeTime(item.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
          title="展开助手状态与动态"
          className="fixed top-3 right-3.5 z-20 hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium pressable animate-pop-up cursor-pointer"
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

      {/* Desktop: Smooth animated floating self-sized companion card */}
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
          className="flex flex-col justify-center w-[320px] shrink-0 h-full py-6 pr-5 pl-1.5 select-none"
        >
          <div
            data-testid="companion-floating-card"
            className="max-h-full flex flex-col rounded-3xl overflow-hidden"
            style={{
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {/* Hero Donut Presence Header */}
            <div
              className="px-5 pt-5 pb-4 relative flex flex-col items-center text-center shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div className="absolute top-3 right-3 flex items-center gap-0.5">
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
                className={`w-16 h-16 rounded-full flex items-center justify-center text-4xl shrink-0 ${
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

              <div className="text-[16px] font-semibold tracking-tight mt-2.5 leading-tight">
                {assistantName}
              </div>

              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-medium mt-1.5 max-w-full"
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
            className="px-4 py-3 flex items-center justify-between gap-2 shrink-0"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center text-2xl shrink-0 ${
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
                <div className="text-[15px] font-semibold truncate">{assistantName}</div>
                <div
                  className="flex items-center gap-1.5 text-xs mt-0.5 truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${live.streaming ? 'animate-soft-breathe' : ''}`}
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
                className="p-2 rounded-xl sidebar-row pressable cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="关闭状态面板"
                className="p-2 rounded-xl sidebar-row pressable cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {renderCardBody(true)}
        </div>
      </div>
    </>
  )
}
