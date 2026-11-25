import { useEffect, useState } from 'react'
import { BookOpen, Check, FileText, Loader2, Sparkles, Trash2, X } from 'lucide-react'
import { api, type ProjectDetail, type ProjectItem } from '../api/client'

interface Props {
  projectId: string | null // null => create new project
  activeSessionId?: string | null
  activeSessionInThisProject?: boolean
  onSaved: (project: ProjectItem, created: boolean) => void
  onDeleted?: (projectId: string) => void
  onDistilled?: (projectName: string) => void
  onClose: () => void
}

const PROJECT_EMOJIS = ['📁', '🎓', '🧾', '💻', '✈️', '📚', '💡', '🏃', '🎨', '🌱', '📝', '🎯']

export function ProjectModal({
  projectId,
  activeSessionId,
  activeSessionInThisProject,
  onSaved,
  onDeleted,
  onDistilled,
  onClose,
}: Props) {
  const isCreate = !projectId
  const [loading, setLoading] = useState(!isCreate)
  const [saving, setSaving] = useState(false)
  const [distilling, setDistilling] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activeDoc, setActiveDoc] = useState<'memory' | 'brief'>('memory')

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('📁')
  const [summary, setSummary] = useState('')
  const [briefMd, setBriefMd] = useState('')
  const [memoryMd, setMemoryMd] = useState('')
  const [slug, setSlug] = useState('')

  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!projectId) {
      setLoading(false)
      return
    }
    setLoading(true)
    api
      .getProject(projectId)
      .then((res) => {
        const p: ProjectDetail = res.project
        setName(p.name)
        setEmoji(p.emoji || '📁')
        setSummary(p.summary || '')
        setBriefMd(p.brief_md || '')
        setMemoryMd(p.memory_md || '')
        setSlug(p.slug || '')
      })
      .catch((e) => setErr(e instanceof Error ? e.message : '加载项目失败'))
      .finally(() => setLoading(false))
  }, [projectId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setErr('请填写项目名称')
      return
    }
    setErr('')
    setMsg('')
    setSaving(true)
    try {
      if (isCreate) {
        const res = await api.createProject({
          name: name.trim(),
          emoji,
          summary: summary.trim(),
          brief_md: briefMd.trim() || undefined,
        })
        onSaved(res.project, true)
        onClose()
      } else {
        const res = await api.updateProject(projectId!, {
          name: name.trim(),
          emoji,
          summary: summary.trim(),
          brief_md: briefMd,
          memory_md: memoryMd,
        })
        onSaved(res.project, false)
        setMsg('已保存并同步到项目索引地图')
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleDistill() {
    if (!projectId || !activeSessionId || distilling) return
    setErr('')
    setMsg('')
    setDistilling(true)
    try {
      const res = await api.distillProject(projectId, activeSessionId)
      setMemoryMd(res.memory_md)
      setActiveDoc('memory')
      setMsg('已自动提炼并追加到项目 MEMORY.md')
      onDistilled?.(name || '项目')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '沉淀失败')
    } finally {
      setDistilling(false)
    }
  }

  async function handleDelete() {
    if (!projectId) return
    setSaving(true)
    try {
      await api.deleteProject(projectId)
      onDeleted?.(projectId)
      onClose()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '删除失败')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px] animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl overflow-hidden animate-modal-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-3.5 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">{emoji}</span>
            <h3 className="font-semibold text-[15px] truncate">
              {isCreate ? '新建项目记忆空间' : `${name || '项目'} · 记忆与规范`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg sidebar-row pressable cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={14} className="animate-spin" />
            <span>正在读取项目记忆…</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Emoji + Name */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={40}
                  autoFocus={isCreate}
                  placeholder="项目名称，例如：毕业论文、发票报销、考研英语"
                  className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PROJECT_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-base pressable cursor-pointer"
                    style={{
                      background: emoji === em ? 'var(--bg-active)' : 'var(--bg-elevated)',
                      border:
                        emoji === em
                          ? '1.5px solid var(--accent)'
                          : '1px solid var(--border-subtle)',
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            {/* One-line summary for _index.md */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  一句话定位（用于主对话“游龙”索引）
                </label>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {summary.length}/160
                </span>
              </div>
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={160}
                placeholder="例如：记录大创结题材料、实验进度与导师修改意见"
                className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              />
            </div>

            {isCreate ? (
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  初始项目背景（可选，写入 BRIEF.md）
                </label>
                <textarea
                  rows={5}
                  value={briefMd}
                  onChange={(e) => setBriefMd(e.target.value)}
                  placeholder="写下项目目标、背景、关键约束或你的偏好，进入此项目的所有对话都会自动继承。"
                  className="w-full px-3 py-2.5 rounded-xl text-xs leading-relaxed outline-none resize-y font-mono"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div
                    className="inline-flex p-0.5 rounded-xl text-xs"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveDoc('memory')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium pressable cursor-pointer"
                      style={{
                        background: activeDoc === 'memory' ? 'var(--bg-surface)' : 'transparent',
                        color:
                          activeDoc === 'memory' ? 'var(--text-primary)' : 'var(--text-muted)',
                        boxShadow: activeDoc === 'memory' ? 'var(--shadow-sm)' : 'none',
                      }}
                    >
                      <BookOpen size={12} />
                      <span>项目记忆 MEMORY.md</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDoc('brief')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium pressable cursor-pointer"
                      style={{
                        background: activeDoc === 'brief' ? 'var(--bg-surface)' : 'transparent',
                        color: activeDoc === 'brief' ? 'var(--text-primary)' : 'var(--text-muted)',
                        boxShadow: activeDoc === 'brief' ? 'var(--shadow-sm)' : 'none',
                      }}
                    >
                      <FileText size={12} />
                      <span>项目规范 BRIEF.md</span>
                    </button>
                  </div>

                  {activeSessionId && activeSessionInThisProject && (
                    <button
                      type="button"
                      disabled={distilling}
                      onClick={handleDistill}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
                      style={{
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      {distilling ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      <span>{distilling ? '提炼沉淀中…' : '一键沉淀本次对话'}</span>
                    </button>
                  )}
                </div>

                {activeDoc === 'memory' ? (
                  <textarea
                    rows={9}
                    value={memoryMd}
                    onChange={(e) => setMemoryMd(e.target.value)}
                    placeholder="项目推进中的重要决定、里程碑、待办都会沉淀在这里…"
                    className="w-full px-3 py-2.5 rounded-xl text-xs leading-relaxed outline-none resize-y font-mono"
                    style={{
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  />
                ) : (
                  <textarea
                    rows={9}
                    value={briefMd}
                    onChange={(e) => setBriefMd(e.target.value)}
                    placeholder="项目目标、背景、规则约束…"
                    className="w-full px-3 py-2.5 rounded-xl text-xs leading-relaxed outline-none resize-y font-mono"
                    style={{
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  />
                )}

                {slug && (
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    工作区路径：<code>projects/{slug}/</code> · 主对话可随时按需读写
                  </div>
                )}
              </div>
            )}

            {msg && (
              <div className="text-xs flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                <Check size={13} />
                <span>{msg}</span>
              </div>
            )}
            {err && (
              <div className="text-xs" style={{ color: 'var(--danger)' }}>
                {err}
              </div>
            )}

            {/* Footer actions */}
            <div
              className="pt-3 flex items-center justify-between gap-2"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              {!isCreate ? (
                confirmDelete ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span style={{ color: 'var(--danger)' }}>确认归档删除？</span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleDelete}
                      className="px-2.5 py-1 rounded-lg font-medium pressable cursor-pointer"
                      style={{ background: 'var(--danger)', color: '#fff' }}
                    >
                      确认
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2 py-1 rounded-lg sidebar-row cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs sidebar-row pressable cursor-pointer"
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={13} />
                    <span>删除项目</span>
                  </button>
                )
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium sidebar-row pressable cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  关闭
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-40"
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                  }}
                >
                  {saving ? '保存中…' : isCreate ? '创建项目' : '保存更改'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
