import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import {
  api,
  type FocusItem,
  type FocusState,
  type FocusTagColor,
  type FocusUrgency,
} from '../../api/client'
import { TAG_COLOR_META, URGENCY_META } from './focusMeta'

export function FocusItemModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: FocusItem | null
  onClose: () => void
  onSaved: (next: FocusState, msg: string) => void
}) {
  const [title, setTitle] = useState(editing?.title || '')
  const [urgency, setUrgency] = useState<FocusUrgency>(editing?.urgency || 'plan')
  const [tag, setTag] = useState(editing?.tag || '')
  const [tagColor, setTagColor] = useState<FocusTagColor>(editing?.tag_color || 'slate')
  const [countdown, setCountdown] = useState(editing?.countdown || '')
  const [progress, setProgress] = useState(editing?.progress || '')
  const [sourceUrl, setSourceUrl] = useState(editing?.source_url || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const inputStyle = {
    background: 'var(--bg-sidebar)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setErr('请填写焦点事项标题')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const payload = {
        title: title.trim(),
        urgency,
        tag: tag.trim(),
        tag_color: tagColor,
        countdown: countdown.trim(),
        progress: progress.trim(),
        source_url: sourceUrl.trim(),
      }
      const res = editing
        ? await api.updateFocusItem(editing.id, payload)
        : await api.addFocusItem(payload)
      onSaved(res.focus, editing ? `已更新「${payload.title}」` : `已添加「${payload.title}」`)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-testid="focus-item-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
      onClick={() => !saving && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl p-5 space-y-4 animate-modal-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-semibold">
            {editing ? '编辑焦点事项' : '添加焦点事项'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl sidebar-row cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {err && (
          <div
            className="px-3 py-2 rounded-xl text-xs"
            style={{
              background: 'rgba(220,38,38,0.08)',
              color: 'var(--danger)',
              border: '1px solid rgba(220,38,38,0.2)',
            }}
          >
            {err}
          </div>
        )}

        <div className="space-y-3">
          <label className="block space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>事项标题 *</span>
            <input
              data-testid="focus-modal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：提交 11 月差旅报销单"
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={inputStyle}
            />
          </label>

          <div className="space-y-1">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              紧急层级
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(['must', 'soon', 'plan'] as FocusUrgency[]).map((u) => {
                const active = urgency === u
                const meta = URGENCY_META[u]
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUrgency(u)}
                    className="px-2.5 py-2 rounded-xl text-xs font-medium pressable cursor-pointer"
                    style={{
                      background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: active ? 'var(--accent-contrast)' : meta.color,
                    }}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>类别标签</span>
              <input
                data-testid="focus-modal-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="工作 / 论文 / 生活"
                className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                style={inputStyle}
              />
            </label>
            <label className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>倒计时文案</span>
              <input
                data-testid="focus-modal-countdown"
                value={countdown}
                onChange={(e) => setCountdown(e.target.value)}
                placeholder="今天 18:00 / 剩 3 天"
                className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                style={inputStyle}
              />
            </label>
          </div>

          <div className="space-y-1">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              标签色标
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TAG_COLOR_META) as FocusTagColor[]).map((ck) => {
                const m = TAG_COLOR_META[ck]
                return (
                  <button
                    key={ck}
                    type="button"
                    onClick={() => setTagColor(ck)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] cursor-pointer pressable"
                    style={{
                      background: m.bg,
                      color: m.color,
                      outline: tagColor === ck ? '1.5px solid var(--accent)' : 'none',
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                    <span>{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>当前进展（1 行摘要）</span>
            <input
              data-testid="focus-modal-progress"
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
              placeholder="例如：发票已归档，差最终核对"
              className="w-full px-3 py-2 rounded-xl text-xs outline-none"
              style={inputStyle}
            />
          </label>

          <label className="block space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>源链接（可选）</span>
            <input
              data-testid="focus-modal-source-url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-xl text-xs outline-none font-mono"
              style={inputStyle}
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium sidebar-row cursor-pointer"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            data-testid="focus-modal-save"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            <span>保存</span>
          </button>
        </div>
      </form>
    </div>
  )
}
