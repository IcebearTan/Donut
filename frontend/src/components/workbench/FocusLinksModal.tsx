import { useState } from 'react'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { api, type FocusExternalLink, type FocusState } from '../../api/client'

export function FocusLinksModal({
  initialLinks,
  onClose,
  onSaved,
}: {
  initialLinks: FocusExternalLink[]
  onClose: () => void
  onSaved: (next: FocusState) => void
}) {
  const [links, setLinks] = useState<Array<{ id?: string; label: string; url: string }>>(
    initialLinks.length > 0 ? initialLinks : [{ label: '', url: '' }],
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const valid = links
      .map((l) => ({ id: l.id, label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label && l.url)
    for (const l of valid) {
      if (!/^https?:\/\//i.test(l.url) && !l.url.startsWith('/')) {
        setErr(`链接「${l.label}」请以 https:// 或 http:// 开头`)
        return
      }
    }
    setSaving(true)
    setErr('')
    try {
      const res = await api.updateFocusLinks(valid)
      onSaved(res.focus)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-testid="focus-links-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
      onClick={() => !saving && onClose()}
    >
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl p-5 space-y-4 animate-modal-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-semibold">外部仓库快捷入口</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              按账号独立保存，如 Notion HQ、滴答清单等（可留空）
            </p>
          </div>
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

        <div className="space-y-2.5 max-h-64 overflow-y-auto pr-0.5">
          {links.map((lnk, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={lnk.label}
                onChange={(e) =>
                  setLinks((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)),
                  )
                }
                placeholder="名称（如 Notion HQ）"
                className="w-32 px-2.5 py-2 rounded-xl text-xs outline-none"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                value={lnk.url}
                onChange={(e) =>
                  setLinks((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, url: e.target.value } : x)),
                  )
                }
                placeholder="https://..."
                className="flex-1 min-w-0 px-2.5 py-2 rounded-xl text-xs font-mono outline-none"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                className="p-1.5 rounded-lg sidebar-row cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
                title="移除"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        {links.length < 8 && (
          <button
            type="button"
            onClick={() => setLinks((prev) => [...prev, { label: '', url: '' }])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sidebar-row cursor-pointer"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            <Plus size={13} />
            <span>新增快捷入口</span>
          </button>
        )}

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
            data-testid="focus-links-save"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            <span>保存入口</span>
          </button>
        </div>
      </form>
    </div>
  )
}
