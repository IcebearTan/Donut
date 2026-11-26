import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckSquare,
  Download,
  FileText,
  FolderArchive,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
} from 'lucide-react'
import {
  api,
  type ReimbursementItem,
  type ReimbursementListResponse,
} from '../api/client'
import { ReimbursementModal } from './ReimbursementModal'

interface Props {
  onOpenVault?: () => void
  onToast?: (msg: string) => void
}

function fmtMoney(v: number): string {
  return `¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function docTone(val: string): string {
  if (val === '有') return 'var(--success)'
  if (val === '无') return 'var(--danger)'
  return '#f59e0b'
}

export function ReimbursementTab({ onOpenVault, onToast }: Props) {
  const [data, setData] = useState<ReimbursementListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [monthFilter, setMonthFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [updatingRow, setUpdatingRow] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ReimbursementItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ReimbursementItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await api.listReimbursements()
      setData(res)
      setSelectedRows(new Set())
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载报销台账失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const items = data?.items || []
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (monthFilter !== 'ALL' && it.month !== monthFilter) return false
      if (statusFilter !== 'ALL' && it.claim_status !== statusFilter) return false
      if (q) {
        const hay = `${it.title} ${it.platform} ${it.note} ${it.spend_date}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, query, monthFilter, statusFilter])

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((it) => selectedRows.has(it.row_index))

  function toggleRow(idx: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(filtered.map((it) => it.row_index)))
    }
  }

  async function handleStatusChange(item: ReimbursementItem, nextStatus: string) {
    setUpdatingRow(item.row_index)
    try {
      await api.updateReimbursement(item.row_index, {
        expected_fingerprint: item.fingerprint,
        claim_status: nextStatus,
      })
      onToast?.(`已将「${item.title}」状态改为 ${nextStatus}`)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '更新状态失败')
    } finally {
      setUpdatingRow(null)
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await api.deleteReimbursement(confirmDelete.row_index, confirmDelete.fingerprint)
      onToast?.(`已删除「${confirmDelete.title}」`)
      setConfirmDelete(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  async function handleExportZip() {
    const targetIndices =
      selectedRows.size > 0
        ? Array.from(selectedRows)
        : filtered.map((it) => it.row_index)
    if (targetIndices.length === 0) return
    setExporting(true)
    setErr('')
    try {
      const blob = await api.exportReimbursementsZip(targetIndices)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      a.download = `报销材料打包_${today}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      onToast?.(`已导出 ${targetIndices.length} 笔报销材料压缩包`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '打包导出失败')
    } finally {
      setExporting(false)
    }
  }

  const summary = data?.summary
  const facets = data?.facets

  return (
    <div data-testid="reimbursement-tab" className="space-y-5 animate-msg-in">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: '有效报销总额',
            value: fmtMoney(summary?.active_total ?? 0),
            sub: `共 ${summary?.total_count ?? 0} 笔（含取消 ${summary?.cancelled_count ?? 0}）`,
          },
          {
            label: '待投单 / 待整理',
            value: fmtMoney(summary?.pending_submit_total ?? 0),
            sub: `${summary?.pending_submit_count ?? 0} 笔待提交`,
          },
          {
            label: '已报销 · 待结款',
            value: fmtMoney(summary?.in_flight_total ?? 0),
            sub: `${summary?.in_flight_count ?? 0} 笔财务审核中`,
          },
          {
            label: '已结款到账',
            value: fmtMoney(summary?.settled_total ?? 0),
            sub: `${summary?.settled_count ?? 0} 笔已完成`,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="p-4 rounded-2xl space-y-1"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {card.label}
            </div>
            <div className="text-xl font-semibold tabular-nums tracking-tight">
              {card.value}
            </div>
            <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Filter & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] sm:w-56">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              data-testid="reimb-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索项目、平台、备注…"
              className="w-full pl-8 pr-3 py-2 rounded-xl text-xs outline-none"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs outline-none cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="ALL">全部月份</option>
            {(facets?.months || []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs outline-none cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="ALL">全部状态</option>
            {(facets?.claim_statuses || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={load}
            title="刷新台账"
            className="w-8 h-8 rounded-full flex items-center justify-center sidebar-row pressable cursor-pointer"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>

          {onOpenVault && (
            <button
              type="button"
              onClick={onOpenVault}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium sidebar-row pressable cursor-pointer"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <FolderArchive size={13} />
              <span>原件文件仓</span>
            </button>
          )}

          <button
            type="button"
            data-testid="reimb-export-zip-btn"
            disabled={exporting || filtered.length === 0}
            onClick={handleExportZip}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium sidebar-row pressable cursor-pointer disabled:opacity-45"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <span>
              {selectedRows.size > 0 ? `打包选中 (${selectedRows.size})` : '打包导出 ZIP'}
            </span>
          </button>

          <button
            type="button"
            data-testid="reimb-add-btn"
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium pressable cursor-pointer"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-contrast)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Plus size={13} />
            <span>新增报销</span>
          </button>
        </div>
      </div>

      {err && (
        <div
          className="px-4 py-2.5 rounded-2xl text-xs"
          style={{
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--danger)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          {err}
        </div>
      )}

      {/* Ledger Table */}
      <div
        data-testid="reimb-table"
        className="rounded-3xl overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {loading && !data ? (
          <div className="py-12 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={15} className="animate-spin" />
            <span>正在读取本地报销台账…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center space-y-1.5">
            <div className="text-sm font-medium">暂无匹配的报销记录</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              发发票给 Donut 自动归档，或点击右上角「新增报销」手动记一笔
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <th className="py-3 pl-4 pr-2 w-8">
                    <button
                      type="button"
                      onClick={toggleAllVisible}
                      className="cursor-pointer flex items-center"
                      title="全选 / 取消"
                    >
                      {allVisibleSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>
                  </th>
                  <th className="py-3 px-2.5 font-medium whitespace-nowrap">日期</th>
                  <th className="py-3 px-2.5 font-medium">项目与凭证原件</th>
                  <th className="py-3 px-2.5 font-medium whitespace-nowrap">三单核对</th>
                  <th className="py-3 px-2.5 font-medium text-right whitespace-nowrap">金额</th>
                  <th className="py-3 px-2.5 font-medium whitespace-nowrap">报单状态</th>
                  <th className="py-3 pl-2 pr-4 font-medium text-right whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const isCancelled = it.claim_status.includes('取消')
                  const checked = selectedRows.has(it.row_index)
                  return (
                    <tr
                      key={`${it.row_index}-${it.fingerprint}`}
                      data-testid={`reimb-row-${it.row_index}`}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        opacity: isCancelled ? 0.58 : 1,
                      }}
                    >
                      <td className="py-3 pl-4 pr-2 align-top">
                        <button
                          type="button"
                          onClick={() => toggleRow(it.row_index)}
                          className="cursor-pointer mt-0.5"
                          style={{ color: checked ? 'var(--accent)' : 'var(--text-muted)' }}
                        >
                          {checked ? <CheckSquare size={15} /> : <Square size={15} />}
                        </button>
                      </td>
                      <td className="py-3 px-2.5 align-top whitespace-nowrap">
                        <div className="tabular-nums font-medium">{it.spend_date || '-'}</div>
                        {it.platform && (
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {it.platform}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2.5 align-top min-w-[200px]">
                        <div className={`text-[13px] font-medium ${isCancelled ? 'line-through' : ''}`}>
                          {it.title}
                        </div>
                        {it.note && (
                          <div className="text-[11.5px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                            {it.note}
                          </div>
                        )}
                        {it.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {it.attachments.slice(0, 3).map((att) => (
                              <a
                                key={att.path}
                                href={att.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] sidebar-row"
                                style={{
                                  background: 'var(--bg-elevated)',
                                  color: 'var(--text-secondary)',
                                }}
                                title={att.path}
                              >
                                <FileText size={11} className="shrink-0" />
                                <span className="max-w-[140px] truncate">{att.name}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2.5 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                          {[
                            { k: '票', v: it.has_invoice },
                            { k: '单', v: it.has_order },
                            { k: '付', v: it.has_payment },
                          ].map((d) => (
                            <span
                              key={d.k}
                              title={`${d.k}：${d.v}`}
                              className="inline-flex items-center gap-1"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: docTone(d.v) }}
                              />
                              <span>{d.k}</span>
                            </span>
                          ))}
                        </div>
                        {it.has_invoice !== '有' && (
                          <div className="text-[10.5px] mt-0.5" style={{ color: '#f59e0b' }}>
                            发票：{it.has_invoice}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2.5 align-top text-right whitespace-nowrap">
                        <span
                          className={`text-[13px] font-semibold tabular-nums ${
                            isCancelled ? 'line-through' : ''
                          }`}
                        >
                          {fmtMoney(it.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-2.5 align-top whitespace-nowrap">
                        <select
                          data-testid={`reimb-status-${it.row_index}`}
                          disabled={updatingRow === it.row_index}
                          value={it.claim_status}
                          onChange={(e) => handleStatusChange(it, e.target.value)}
                          className="px-2 py-1 rounded-lg text-[11.5px] outline-none cursor-pointer disabled:opacity-50"
                          style={{
                            background: 'var(--bg-sidebar)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {(facets?.claim_statuses || []).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pl-2 pr-4 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            data-testid={`reimb-edit-${it.row_index}`}
                            onClick={() => {
                              setEditing(it)
                              setModalOpen(true)
                            }}
                            title="编辑"
                            className="p-1.5 rounded-lg sidebar-row cursor-pointer"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            data-testid={`reimb-delete-${it.row_index}`}
                            onClick={() => setConfirmDelete(it)}
                            title="删除"
                            className="p-1.5 rounded-lg sidebar-row cursor-pointer"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data?.ledger_path && (
        <div className="text-[11px] px-1" style={{ color: 'var(--text-muted)' }}>
          唯一数据源：文件仓 <code>archive/{data.ledger_path}</code>（与 Donut 聊天归档实时同步）
        </div>
      )}

      {modalOpen && facets && (
        <ReimbursementModal
          editing={editing}
          facets={facets}
          onClose={() => setModalOpen(false)}
          onSaved={async (msg) => {
            setModalOpen(false)
            onToast?.(msg)
            await load()
          }}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 animate-backdrop-in"
          onClick={() => !deleting && setConfirmDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl p-5 space-y-4 animate-modal-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div className="space-y-1">
              <h3 className="text-[15px] font-semibold">删除这条报销记录？</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                将从本地台账移除「{confirmDelete.title}」（{fmtMoney(confirmDelete.amount)}），不会删除文件仓里的原件 PDF。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs sidebar-row cursor-pointer"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--danger)', color: '#fff' }}
              >
                {deleting && <Loader2 size={12} className="animate-spin" />}
                <span>确认删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
