import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Check,
  Code2,
  Eye,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import {
  api,
  type SkillDetail,
  type SkillItem,
  type ToolScriptItem,
  type UserProfile,
} from '../api/client'

interface Props {
  user: UserProfile
  embedded?: boolean
  onTeachInChat: () => void
  onChanged?: () => void
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${min}`
}

const NEW_SKILL_TEMPLATE = (slug: string) => `---
name: ${slug}
description: 一句话说明何时触发该技能以及它能帮你完成什么任务
---

# ${slug}

## 1. 触发场景
- 当我提到……时使用本技能。

## 2. 执行规范
- 先简短回复一步计划，再执行操作。
- 如有产出文件，保存到 \`vault/artifacts/\` 并提供下载链接。
`

export function SkillsView({ user, embedded = false, onTeachInChat, onChanged }: Props) {
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [tools, setTools] = useState<ToolScriptItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [query, setQuery] = useState('')

  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [draftContent, setDraftContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedTip, setSavedTip] = useState('')
  const [error, setError] = useState('')

  // New skill creation
  const [creating, setCreating] = useState(false)
  const [newSlug, setNewSlug] = useState('')

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<SkillItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const assistantName = user.assistant_name || 'Donut'

  const loadSkills = useCallback(async (preferredId?: string | null) => {
    setLoadingList(true)
    setError('')
    try {
      const res = await api.listSkills()
      setSkills(res.skills)
      setTools(res.tools || [])
      const targetId =
        preferredId && res.skills.some((s) => s.id === preferredId)
          ? preferredId
          : res.skills[0]?.id || null
      setSelectedId(targetId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载技能库失败')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setDraftContent('')
      return
    }
    setLoadingDetail(true)
    setError('')
    setSavedTip('')
    api
      .getSkill(selectedId)
      .then((res) => {
        setDetail(res.skill)
        setDraftContent(res.skill.content)
        setMode('preview')
      })
      .catch((e) => setError(e instanceof Error ? e.message : '读取技能详情失败'))
      .finally(() => setLoadingDetail(false))
  }, [selectedId])

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return skills
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q),
    )
  }, [skills, query])

  async function handleSave() {
    if (!selectedId || !draftContent.trim()) return
    setSaving(true)
    setError('')
    setSavedTip('')
    try {
      const res = await api.saveSkill(selectedId, draftContent)
      setDetail(res.skill)
      setDraftContent(res.skill.content)
      setSkills((prev) =>
        prev.map((s) =>
          s.id === res.skill.id
            ? {
                ...s,
                name: res.skill.name,
                description: res.skill.description,
                updated_at: res.skill.updated_at,
              }
            : s,
        ),
      )
      setSavedTip('已保存并实时生效')
      setMode('preview')
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateSkill(e: React.FormEvent) {
    e.preventDefault()
    const clean = newSlug.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9_-]{0,48}$/.test(clean)) {
      setError('技能 ID 需以小写字母或数字开头，仅支持 a-z、0-9、-、_')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await api.saveSkill(clean, NEW_SKILL_TEMPLATE(clean))
      setCreating(false)
      setNewSlug('')
      await loadSkills(res.skill.id)
      setDetail(res.skill)
      setDraftContent(res.skill.content)
      setMode('edit')
      onChanged?.()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    setError('')
    try {
      await api.deleteSkill(confirmDelete.id)
      setConfirmDelete(null)
      await loadSkills()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const isDirty = detail ? draftContent !== detail.content : false

  return (
    <div
      data-testid="skills-page"
      className={embedded ? 'space-y-5' : 'chat-scroll flex-1 min-h-0 overflow-y-auto'}
    >
      <div
        className={
          embedded
            ? 'space-y-5'
            : 'max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-12 space-y-6'
        }
      >
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              {embedded ? (
                <h2 className="text-[17px] font-semibold tracking-tight">技能库</h2>
              ) : (
                <h1 className="text-2xl font-semibold tracking-tight">技能库</h1>
              )}
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Sparkles size={11} />
                <span>已掌握 {skills.length} 项专属技能</span>
              </span>
            </div>
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {assistantName} 在日常协作中为你沉淀的自进化技能（skills/*/SKILL.md），支持在线查阅、微调规则或新建专属工作流
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => loadSkills(selectedId)}
              title="刷新技能列表"
              className="w-9 h-9 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onTeachInChat}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <MessageSquarePlus size={14} />
              <span>对话教新技能</span>
            </button>
            <button
              type="button"
              data-testid="new-skill-btn"
              onClick={() => {
                setCreating((v) => !v)
                setError('')
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium pressable cursor-pointer"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Plus size={14} />
              <span>新建技能</span>
            </button>
          </div>
        </div>

        {/* Inline New Skill Creator */}
        {creating && (
          <form
            onSubmit={handleCreateSkill}
            className="p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 animate-msg-in"
            style={{
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-strong)',
            }}
          >
            <div className="flex-1 min-w-0">
              <input
                autoFocus
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="输入技能英文 ID，例如 weekly-report 或 study-review"
                className="w-full px-3.5 py-2 rounded-xl text-sm outline-none font-mono"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={saving || !newSlug.trim()}
                className="px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-45"
                style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
              >
                创建并编辑
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-3 py-2 rounded-xl text-xs sidebar-row cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                取消
              </button>
            </div>
          </form>
        )}

        {error && (
          <div
            className="px-4 py-3 rounded-2xl text-xs"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--danger)',
              color: 'var(--danger)',
            }}
          >
            {error}
          </div>
        )}

        {/* Main 2-column Skills Studio */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left column: Skill cards + tools */}
          <div className="lg:col-span-4 space-y-4">
            <div
              className="flex items-center gap-2 px-3.5 py-2 rounded-full"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <Search size={14} style={{ color: 'var(--text-muted)' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索技能名称或简介…"
                className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px]"
                style={{ color: 'var(--text-primary)' }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {loadingList ? (
              <div className="py-10 flex justify-center" style={{ color: 'var(--text-muted)' }}>
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : filteredSkills.length === 0 ? (
              <div
                className="p-6 rounded-2xl text-center text-xs space-y-2"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <Sparkles size={20} className="mx-auto opacity-60" />
                <div>还没有匹配的技能</div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSkills.map((sk) => {
                  const active = selectedId === sk.id
                  return (
                    <button
                      key={sk.id}
                      type="button"
                      data-testid={`skill-card-${sk.id}`}
                      onClick={() => setSelectedId(sk.id)}
                      className="w-full text-left p-4 rounded-2xl transition-all cursor-pointer pressable"
                      style={{
                        background: active ? 'var(--bg-surface)' : 'var(--bg-sidebar)',
                        border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
                        boxShadow: active ? 'var(--shadow-sm)' : 'none',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Sparkles
                            size={14}
                            className="shrink-0"
                            style={{ color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}
                          />
                          <span className="text-[14.5px] font-semibold truncate">{sk.name}</span>
                        </div>
                        <span
                          className="text-[11px] tabular-nums shrink-0"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {formatDate(sk.updated_at)}
                        </span>
                      </div>
                      <div
                        className="text-[11px] font-mono mt-1 opacity-75 truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        skills/{sk.id}/SKILL.md
                      </div>
                      {sk.description && (
                        <p
                          className="text-xs mt-2 leading-relaxed line-clamp-2"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {sk.description}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Helper scripts strip (tools/) */}
            {tools.length > 0 && (
              <div
                className="p-4 rounded-2xl space-y-2.5"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  className="flex items-center gap-1.5 text-xs font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Wrench size={12} />
                  <span>配套脚本工具（tools/）</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tools.map((t) => (
                    <span
                      key={t.name}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Code2 size={12} className="opacity-70" />
                      <span>{t.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: Full Skill Reader & Editor */}
          <div
            className="lg:col-span-8 rounded-3xl overflow-hidden"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {loadingDetail ? (
              <div
                className="py-24 flex flex-col items-center justify-center gap-2 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <Loader2 size={20} className="animate-spin" />
                <span>正在读取技能文档…</span>
              </div>
            ) : !detail ? (
              <div
                className="py-24 px-6 text-center text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                在左侧选择一个技能查看或编辑其完整规则
              </div>
            ) : (
              <div>
                {/* Detail toolbar */}
                <div
                  className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold truncate">{detail.name}</h2>
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-mono"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                      >
                        {detail.id}
                      </span>
                    </div>
                    {savedTip && (
                      <div
                        className="inline-flex items-center gap-1 text-xs mt-1"
                        style={{ color: 'var(--success)' }}
                      >
                        <Check size={12} />
                        <span>{savedTip}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div
                      className="inline-flex p-0.5 rounded-xl text-xs"
                      style={{ background: 'var(--bg-elevated)' }}
                    >
                      <button
                        type="button"
                        onClick={() => setMode('preview')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer"
                        style={{
                          background: mode === 'preview' ? 'var(--bg-surface)' : 'transparent',
                          color: mode === 'preview' ? 'var(--text-primary)' : 'var(--text-muted)',
                          boxShadow: mode === 'preview' ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <Eye size={13} />
                        <span>阅读</span>
                      </button>
                      <button
                        type="button"
                        data-testid="skill-edit-mode-btn"
                        onClick={() => setMode('edit')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer"
                        style={{
                          background: mode === 'edit' ? 'var(--bg-surface)' : 'transparent',
                          color: mode === 'edit' ? 'var(--text-primary)' : 'var(--text-muted)',
                          boxShadow: mode === 'edit' ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <Pencil size={13} />
                        <span>编辑</span>
                      </button>
                    </div>

                    {mode === 'edit' && (
                      <button
                        type="button"
                        disabled={saving || !isDirty}
                        onClick={handleSave}
                        data-testid="skill-save-btn"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-40"
                        style={{
                          background: 'var(--accent)',
                          color: 'var(--accent-contrast)',
                        }}
                      >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        <span>保存</span>
                      </button>
                    )}

                    {detail.id !== 'skill-forge' && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDelete({
                            id: detail.id,
                            name: detail.name,
                            description: detail.description,
                            updated_at: detail.updated_at,
                          })
                        }
                        title="删除技能"
                        className="p-2 rounded-xl sidebar-row pressable cursor-pointer"
                        style={{ color: 'var(--danger)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Content body */}
                <div className="p-5 sm:p-6">
                  {mode === 'preview' ? (
                    <div className="md-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {detail.content.replace(/^---[\s\S]*?---\s*/, '')}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <textarea
                      value={draftContent}
                      onChange={(e) => setDraftContent(e.target.value)}
                      rows={20}
                      className="w-full p-4 rounded-2xl font-mono text-[13px] leading-relaxed outline-none resize-y"
                      style={{
                        background: 'var(--bg-sidebar)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete skill confirm modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-4 animate-modal-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-[16px] font-semibold">删除这个技能？</h3>
              <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                将删除「<span className="font-medium" style={{ color: 'var(--text-primary)' }}>{confirmDelete.name}</span>」（`skills/{confirmDelete.id}`），之后 {assistantName} 将不再自动调用该技能。
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-[13.5px] font-medium sidebar-row pressable cursor-pointer"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13.5px] font-medium pressable cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--danger)', color: '#ffffff' }}
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                <span>确认删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
