import { useState } from 'react'
import { MessageSquare, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import type { ChatSession, UserProfile } from '../api/client'

interface Props {
  user: UserProfile
  sessions: ChatSession[]
  activeSessionId: string | null
  openMobile: boolean
  onCloseMobile: () => void
  onNewSession: () => void
  onSelectSession: (id: string) => void
  onRenameSession: (id: string, title: string) => void
  onDeleteSession: (id: string) => void
}

export function SessionSidebar({
  user,
  sessions,
  activeSessionId,
  openMobile,
  onCloseMobile,
  onNewSession,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

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

  const content = (
    <aside
      className="h-full w-64 flex flex-col select-none"
      style={{
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            onNewSession()
            onCloseMobile()
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 cursor-pointer"
          style={{
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
          }}
        >
          <Plus size={16} />
          <span>新对话</span>
        </button>
      </div>

      <div className="px-3 pb-1.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        <span>我的对话</span>
        <span>{sessions.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {sessions.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            还没有历史对话，发一句话开始吧
          </div>
        ) : (
          sessions.map((s) => {
            const active = s.id === activeSessionId
            const isEditing = editingId === s.id
            return (
              <div
                key={s.id}
                onClick={() => {
                  if (!isEditing) {
                    onSelectSession(s.id)
                    onCloseMobile()
                  }
                }}
                className="group flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm cursor-pointer transition-colors"
                style={{
                  background: active ? 'var(--bg-active)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <MessageSquare size={14} className="shrink-0 opacity-65" />
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
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
                    <span className="flex-1 truncate text-[13.5px]">{s.title}</span>
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
          })
        )}
      </div>

      <div
        className="p-3 text-xs flex items-center justify-between"
        style={{
          borderTop: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)',
        }}
      >
        <span className="truncate">
          {user.avatar_emoji} {user.display_name} · {user.assistant_name}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)' }}>
          私人隔离
        </span>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop fixed sidebar */}
      <div className="hidden lg:block h-full shrink-0">{content}</div>

      {/* Mobile slide-over drawer */}
      {openMobile && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="relative z-50 h-full">{content}</div>
          <div
            className="flex-1 bg-black/40 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
        </div>
      )}
    </>
  )
}
