import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Pencil, RefreshCw, X } from 'lucide-react'

interface Props {
  data: Record<string, unknown>
  saving: boolean
  onSave: (next: Record<string, unknown>) => Promise<void>
  onRefresh: () => void
}

export function MarkdownTemplate({ data, saving, onSave, onRefresh }: Props) {
  const title = typeof data.title === 'string' ? data.title : ''
  const updatedLabel = typeof data.updated_label === 'string' ? data.updated_label : ''
  const content = typeof data.content === 'string' ? data.content : ''

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)

  useEffect(() => {
    setDraft(content)
  }, [content])

  async function handleSave() {
    await onSave({ ...data, content: draft })
    setEditing(false)
  }

  return (
    <div data-testid="microapp-template-markdown" className="space-y-4 animate-msg-in">
      <div
        className="rounded-3xl p-5 sm:p-6 space-y-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div
          className="flex items-center justify-between gap-3 pb-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>
            {title && <h2 className="text-[16px] font-semibold">{title}</h2>}
            {updatedLabel && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {updatedLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setDraft(content)
                    setEditing(false)
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs sidebar-row cursor-pointer"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                >
                  <X size={12} />
                  <span>取消</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer pressable"
                  style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
                >
                  <Check size={12} />
                  <span>保存</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="w-8 h-8 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                  title="刷新"
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs sidebar-row pressable cursor-pointer"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Pencil size={12} />
                  <span>编辑</span>
                </button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <textarea
            rows={14}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full p-3.5 rounded-2xl text-xs font-mono leading-relaxed outline-none resize-y"
            style={{
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        ) : content.trim() ? (
          <div className="prose-donut text-[14px] leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <div className="py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            暂无简报内容，可点击右上角「编辑」或让 Donut 自动写入
          </div>
        )}
      </div>
    </div>
  )
}
