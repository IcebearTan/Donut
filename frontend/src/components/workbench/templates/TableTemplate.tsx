import { useMemo, useState } from 'react'
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { TableRowModal } from './TableRowModal'

export interface TableColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'select'
  options?: string[]
}

export type TableRow = Record<string, unknown> & { id: string }

interface Props {
  data: Record<string, unknown>
  saving: boolean
  onSave: (next: Record<string, unknown>) => Promise<void>
  onRefresh: () => void
}

export function TableTemplate({ data, saving, onSave, onRefresh }: Props) {
  const rows: TableRow[] = Array.isArray(data.rows)
    ? (data.rows as TableRow[]).map((r, i) => ({ ...r, id: String(r.id || `row_${i}`) }))
    : []

  const columns: TableColumn[] = useMemo(() => {
    if (Array.isArray(data.columns) && data.columns.length > 0) {
      return data.columns as TableColumn[]
    }
    const first = rows[0]
    if (!first) return [{ key: 'title', label: '名称', type: 'text' }]
    return Object.keys(first)
      .filter((k) => k !== 'id')
      .map((k) => ({ key: k, label: k, type: typeof first[k] === 'number' ? 'number' : 'text' }))
  }, [data.columns, rows])

  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<TableRow | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q)),
    )
  }, [rows, columns, query])

  const numericTotals = useMemo(() => {
    return columns
      .filter((c) => c.type === 'number')
      .map((c) => ({
        key: c.key,
        label: c.label,
        sum: filtered.reduce((acc, r) => acc + (Number(r[c.key]) || 0), 0),
      }))
  }, [columns, filtered])

  async function handleSaveRow(built: TableRow) {
    const nextRows = editingRow
      ? rows.map((r) => (r.id === editingRow.id ? built : r))
      : [built, ...rows]
    await onSave({ ...data, columns, rows: nextRows })
    setModalOpen(false)
  }

  async function handleInlineSelect(rowId: string, key: string, val: string) {
    const nextRows = rows.map((r) => (r.id === rowId ? { ...r, [key]: val } : r))
    await onSave({ ...data, columns, rows: nextRows })
  }

  async function handleDeleteRow(rowId: string) {
    const nextRows = rows.filter((r) => r.id !== rowId)
    await onSave({ ...data, columns, rows: nextRows })
  }

  return (
    <div data-testid="microapp-template-table" className="space-y-4 animate-msg-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-56">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索记录…"
              className="w-full pl-8 pr-3 py-2 rounded-xl text-xs outline-none"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <span
            className="px-2.5 py-1.5 rounded-xl text-xs tabular-nums"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
          >
            共 {filtered.length} 条
          </span>
          {numericTotals.map((nt) => (
            <span
              key={nt.key}
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium tabular-nums"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              {nt.label}合计：{nt.sum.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="w-8 h-8 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            title="刷新"
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            data-testid="table-add-btn"
            onClick={() => {
              setEditingRow(null)
              setModalOpen(true)
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium pressable cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            <Plus size={13} />
            <span>新增记录</span>
          </button>
        </div>
      </div>

      <div
        className="rounded-3xl overflow-hidden"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            暂无台账记录，点击右上角「新增记录」添加
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  {columns.map((c) => (
                    <th key={c.key} className="py-3 px-3.5 font-medium whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  <th className="py-3 px-3.5 font-medium text-right whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    data-testid={`table-row-${row.id}`}
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className="py-3 px-3.5 align-middle">
                        {c.type === 'select' && Array.isArray(c.options) && c.options.length > 0 ? (
                          <select
                            disabled={saving}
                            value={String(row[c.key] ?? '')}
                            onChange={(e) => handleInlineSelect(row.id, c.key, e.target.value)}
                            className="px-2 py-1 rounded-lg text-[11.5px] outline-none cursor-pointer"
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
                          <span className={c.type === 'number' || c.type === 'date' ? 'tabular-nums' : ''}>
                            {String(row[c.key] ?? '—')}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRow(row)
                            setModalOpen(true)
                          }}
                          className="p-1.5 rounded-lg sidebar-row cursor-pointer"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1.5 rounded-lg sidebar-row cursor-pointer"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <TableRowModal
          columns={columns}
          editingRow={editingRow}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSaveRow}
        />
      )}
    </div>
  )
}
