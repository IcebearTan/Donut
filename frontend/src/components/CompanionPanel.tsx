import { useEffect, useState } from 'react'
import {
  Activity,
  MessageCircle,
  PanelRightClose,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react'
import type { CompanionStatus, UserProfile } from '../api/client'

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
  live: LiveStreamState
  onToggleOpen: () => void
  onRefresh: () => void
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
  return `正在调用 ${name}`
}

export function CompanionPanel({
  user,
  status,
  loading,
  open,
  live,
  onToggleOpen,
  onRefresh,
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

  // Collapsed floating status pill in top-right corner
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggleOpen}
        data-testid="companion-pill-toggle"
        title="展开助手状态与动态"
        className="fixed top-3 right-3.5 z-20 hidden lg:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${live.streaming ? 'animate-pulse' : ''}`}
          style={{ background: dotColor }}
        />
        <span>{assistantName}</span>
        <span style={{ color: 'var(--text-muted)' }}>· {compactLabel}</span>
      </button>
    )
  }

  return (
    <aside
      data-testid="companion-panel"
      className="hidden lg:flex flex-col w-[252px] xl:w-[272px] shrink-0 h-full py-3.5 pr-3.5 pl-1 select-none"
    >
      <div
        className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: 'var(--bg-sidebar)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Companion header */}
        <div
          className="px-4 py-3.5 flex items-center justify-between gap-2 shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {assistantEmoji}
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold truncate leading-tight">
                {assistantName}
              </div>
              <div
                className="flex items-center gap-1.5 text-[11px] mt-0.5 truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${live.streaming ? 'animate-pulse' : ''}`}
                  style={{ background: dotColor }}
                />
                <span className="truncate">{presenceText}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              title="刷新状态"
              className="p-1.5 rounded-lg sidebar-row cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onToggleOpen}
              title="收起状态卡片"
              className="p-1.5 rounded-lg sidebar-row cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
            >
              <PanelRightClose size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-4">
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
                  className="flex items-center justify-between px-2.5 py-2 rounded-xl text-xs"
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
                className="px-2.5 py-2 rounded-xl"
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
                  <span className="text-[11px] font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                    轮
                  </span>
                </div>
              </div>
              <div
                className="px-2.5 py-2 rounded-xl"
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
                {status.activities.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 px-2.5 py-2 rounded-xl text-xs"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span
                      className="mt-0.5 shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {item.kind === 'tool' ? (
                        <Wrench size={12} />
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
      </div>
    </aside>
  )
}
