import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type { TableColumn, TableRow } from './TableTemplate'

export function TableRowModal({
  columns,
  editingRow,
  saving,
  onClose,
  onSave,
}: {
  columns: TableColumn[]
  editingRow: TableRow | null
  saving: boolean
  onClose: () => void
  onSave: (built: TableRow) => Promise<void>
}) {
  const [formValues, setFormValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const col of columns) {
      init[col.key] = editingRow ? String(editingRow[col.key] ?? '') : col.options?.[0] || ''
    }
    return init
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const built: TableRow = {
      id:
        editingRow?.id ||
        `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    }
    for (const col of columns) {
      const raw = formValues[col.key] ?? ''
      built[col.key] = col.type === 'number' ? Number.parseFloat(raw || '0') || 0 : raw.trim()
    }
    await onSave(built)
  }

  return (
    <div
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
          <h3 className="text-[16px] font-semibold">{editingRow ? '编辑记录' : '新增记录'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl sidebar-row cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {columns.map((c) => (
            <label key={c.key} className="block space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>{c.label}</span>
              {c.type === 'select' && Array.isArray(c.options) && c.options.length > 0 ? (
                <select
                  value={formValues[c.key] ?? ''}
                  onChange={(e) => setFormValues((p) => ({ ...p, [c.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {c.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                  step={c.type === 'number' ? 'any' : undefined}
                  value={formValues[c.key] ?? ''}
                  onChange={(e) => setFormValues((p) => ({ ...p, [c.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              )}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
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
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer"
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
