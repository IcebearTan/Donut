import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  Circle,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Unlink,
} from 'lucide-react'
import {
  api,
  type NotionDatabaseCandidate,
  type NotionScheduleConfig,
  type NotionScheduleItem,
  type NotionScheduleListResponse,
} from '../api/client'

interface Props {
  onToast?: (msg: string) => void
}

type BucketFilter = 'active' | 'overdue' | 'today' | 'upcoming' | 'nodate' | 'done'

export function NotionScheduleTab({ onToast }: Props) {
  const [config, setConfig] = useState<NotionScheduleConfig | null>(null)
  const [data, setData] = useState<NotionScheduleListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editingConfig, setEditingConfig] = useState(false)
  const [err, setErr] = useState('')

  // Config form state
  const [tokenInput, setTokenInput] = useState('')
  const [dbIdInput, setDbIdInput] = useState('')
  const [dbNameInput, setDbNameInput] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [candidates, setCandidates] = useState<NotionDatabaseCandidate[]>([])
  const [savingCfg, setSavingCfg] = useState(false)

  // Schedule interaction state
  const [bucket, setBucket] = useState<BucketFilter>('active')
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')
  const [creating, setCreating] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const loadAll = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    setErr('')
    try {
      const [cfg, list] = await Promise.all([
        api.getScheduleConfig(),
        api.listScheduleItems(forceRefresh),
      ])
      setConfig(cfg)
      setData(list)
      setDbIdInput(cfg.database_id || '')
      setDbNameInput(cfg.database_name || '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载 Notion 日程失败')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadAll(false)
  }, [loadAll])

  async function handleDiscover() {
    setDiscovering(true)
    setErr('')
    try {
      const res = await api.discoverNotionDatabases(tokenInput.trim() || undefined)
      setCandidates(res.databases || [])
      if ((res.databases || []).length === 0) {
        setErr('连接成功，但未扫描到已授权的数据库。请在 Notion 数据库右上角「Connections」添加该 Integration。')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '扫描数据库失败')
    } finally {
      setDiscovering(false)
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!dbIdInput.trim()) {
      setErr('请先选择或填写 Notion 数据库 ID')
      return
    }
    setSavingCfg(true)
    setErr('')
    try {
      await api.saveScheduleConfig({
        token: tokenInput.trim() || undefined,
        database_id: dbIdInput.trim(),
        database_name: dbNameInput.trim() || undefined,
      })
      setTokenInput('')
      setEditingConfig(false)
      onToast?.('Notion 日程直连配置已保存')
      await loadAll(true)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存配置失败')
    } finally {
      setSavingCfg(false)
    }
  }

  async function handleClearConfig() {
    setSavingCfg(true)
    try {
      await api.clearScheduleConfig()
      setCandidates([])
      setEditingConfig(false)
      onToast?.('已断开 Notion 日程连接')
      await loadAll(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '断开失败')
    } finally {
      setSavingCfg(false)
    }
  }

  async function handleToggle(item: NotionScheduleItem) {
    if (!data?.can_toggle) return
    setTogglingId(item.id)
    setErr('')
    try {
      await api.toggleScheduleItem(item.id, !item.done)
      onToast?.(item.done ? `已重新打开「${item.title}」` : `已完成「${item.title}」`)
      await loadAll(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '回写 Notion 状态失败')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    const t = newTitle.trim()
    if (!t) return
    setCreating(true)
    setErr('')
    try {
      await api.createScheduleItem(t, newDate || undefined)
      setNewTitle('')
      setNewDate('')
      onToast?.(`已写入 Notion 日程「${t}」`)
      await loadAll(true)
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '创建日程失败')
    } finally {
      setCreating(false)
    }
  }

  const visibleItems = useMemo(() => {
    const all = data?.items || []
    if (bucket === 'active') return all.filter((it) => !it.done)
    return all.filter((it) => it.bucket === bucket)
  }, [data, bucket])

  if (loading && !config) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={15} className="animate-spin" />
        <span>正在检查 Notion 直连状态…</span>
      </div>
    )
  }

  const showSetup = !data?.configured || editingConfig
  const summary = data?.summary || { overdue: 0, today: 0, upcoming: 0, nodate: 0, done: 0 }
  const activeCount = summary.overdue + summary.today + summary.upcoming + summary.nodate

  return (
    <div data-testid="schedule-tab" className="space-y-5 animate-msg-in">
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

      {showSetup ? (
        <form
          data-testid="notion-setup-card"
          onSubmit={handleSaveConfig}
          className="p-5 sm:p-6 rounded-3xl space-y-5"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Link2 size={16} />
                <h2 className="text-[16px] font-semibold">直连 Notion 日程多维表格</h2>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                后端直连 Notion 官方 REST API + 30 秒短缓存，秒开查看、一键勾选完成，完全不消耗大模型额度。
              </p>
            </div>
            {data?.configured && (
              <button
                type="button"
                onClick={() => setEditingConfig(false)}
                className="px-3 py-1.5 rounded-full text-xs sidebar-row cursor-pointer"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                返回列表
              </button>
            )}
          </div>

          <div
            className="p-3.5 rounded-2xl text-xs space-y-1.5 leading-relaxed"
            style={{ background: 'var(--bg-sidebar)', color: 'var(--text-secondary)' }}
          >
            <div>1. 在 Notion 后台创建 Internal Integration，复制密钥（以 <code>ntn_</code> 或 <code>secret_</code> 开头）。</div>
            <div>2. 打开你的 Notion 日程数据库，点右上角 <strong>··· → Connections</strong> 授权给该 Integration。</div>
            <div>3. 粘贴密钥点击「扫描数据库」，选择对应日程表即可完成绑定。</div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                data-testid="notion-token-input"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={
                  config?.has_token
                    ? `已保存密钥 (${config.masked_token})，留空则沿用`
                    : '粘贴 Notion Integration Token (ntn_...)'
                }
                className="flex-1 px-3.5 py-2.5 rounded-xl text-xs outline-none font-mono"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                data-testid="notion-discover-btn"
                disabled={discovering}
                onClick={handleDiscover}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium sidebar-row pressable cursor-pointer disabled:opacity-50"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
              >
                {discovering ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                <span>自动扫描数据库</span>
              </button>
            </div>

            {candidates.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {candidates.map((db) => {
                  const selected = dbIdInput === db.id
                  return (
                    <button
                      key={db.id}
                      type="button"
                      onClick={() => {
                        setDbIdInput(db.id)
                        setDbNameInput(db.name)
                      }}
                      className="p-3 rounded-2xl text-left transition-all cursor-pointer"
                      style={{
                        background: selected ? 'var(--bg-elevated)' : 'var(--bg-sidebar)',
                        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      <div className="text-xs font-medium truncate">{db.name}</div>
                      <div className="text-[11px] truncate mt-1" style={{ color: 'var(--text-muted)' }}>
                        字段：{db.property_names.slice(0, 5).join(' · ') || '标准表'}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                value={dbIdInput}
                onChange={(e) => setDbIdInput(e.target.value)}
                placeholder="Notion 数据库 ID（扫描点选或手动粘贴）"
                className="px-3.5 py-2 rounded-xl text-xs outline-none font-mono"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                value={dbNameInput}
                onChange={(e) => setDbNameInput(e.target.value)}
                placeholder="展示名称（可选，默认读取数据库标题）"
                className="px-3.5 py-2 rounded-xl text-xs outline-none"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {config?.has_token ? (
              <button
                type="button"
                disabled={savingCfg}
                onClick={handleClearConfig}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sidebar-row cursor-pointer"
                style={{ color: 'var(--danger)' }}
              >
                <Unlink size={13} />
                <span>断开连接</span>
              </button>
            ) : (
              <div />
            )}
            <button
              type="submit"
              disabled={savingCfg}
              data-testid="notion-save-config-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium pressable cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              {savingCfg && <Loader2 size={13} className="animate-spin" />}
              <span>验证并保存连接</span>
            </button>
          </div>
        </form>
      ) : (
        <>
          {/* Connected Header & Bucket Pills */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'active', label: `待处理 (${activeCount})` },
                  { id: 'overdue', label: `已逾期 (${summary.overdue})` },
                  { id: 'today', label: `今日 (${summary.today})` },
                  { id: 'upcoming', label: `未来 (${summary.upcoming})` },
                  { id: 'done', label: `已完成 (${summary.done})` },
                ] as const
              ).map((pill) => {
                const active = bucket === pill.id
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setBucket(pill.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
                    style={{
                      background: active ? 'var(--accent)' : 'var(--bg-surface)',
                      color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    {pill.label}
                  </button>
                )
              })}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {data.database_url && (
                <a
                  href={data.database_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs sidebar-row"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>去 Notion 编辑</span>
                  <ExternalLink size={12} />
                </a>
              )}
              <button
                type="button"
                onClick={() => loadAll(true)}
                title="同步最新 Notion 日程"
                className="w-8 h-8 rounded-full flex items-center justify-center sidebar-row cursor-pointer"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setEditingConfig(true)}
                title="Notion 连接设置"
                className="w-8 h-8 rounded-full flex items-center justify-center sidebar-row cursor-pointer"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Settings2 size={13} />
              </button>
            </div>
          </div>

          {/* Quick Add Row */}
          <form
            onSubmit={handleQuickAdd}
            className="flex flex-col sm:flex-row gap-2 p-2.5 rounded-2xl"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={`快速新增一条到「${data.database_name || 'Notion 日程'}」…`}
              className="flex-1 px-3 py-1.5 text-xs outline-none bg-transparent"
              style={{ color: 'var(--text-primary)' }}
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs outline-none"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              />
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-45"
                style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
              >
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                <span>添加</span>
              </button>
            </div>
          </form>

          {/* Schedule Items List */}
          <div
            className="rounded-3xl overflow-hidden divide-y"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {visibleItems.length === 0 ? (
              <div className="py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                当前分类下暂无日程事项
              </div>
            ) : (
              visibleItems.map((it) => (
                <div
                  key={it.id}
                  className="px-4 py-3 flex items-start gap-3 transition-colors"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <button
                    type="button"
                    disabled={!data.can_toggle || togglingId === it.id}
                    onClick={() => handleToggle(it)}
                    className="mt-0.5 shrink-0 cursor-pointer disabled:opacity-40"
                    style={{ color: it.done ? 'var(--success)' : 'var(--text-muted)' }}
                    title={data.can_toggle ? '点击切换完成状态' : '该表暂不支持直接勾选'}
                  >
                    {togglingId === it.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : it.done ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Circle size={16} />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={it.url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-[13.5px] font-medium hover:underline ${
                          it.done ? 'line-through opacity-55' : ''
                        }`}
                      >
                        {it.title}
                      </a>
                      {it.bucket === 'overdue' && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10.5px] font-medium"
                          style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}
                        >
                          已逾期
                        </span>
                      )}
                      {it.priority && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10.5px]"
                          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                        >
                          {it.priority}
                        </span>
                      )}
                      {it.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-[10.5px]"
                          style={{ background: 'var(--bg-sidebar)', color: 'var(--text-muted)' }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                      {it.date_start && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Calendar size={11} />
                          <span>
                            {it.date_start}
                            {it.date_end ? ` → ${it.date_end}` : ''}
                          </span>
                        </span>
                      )}
                      {it.status && <span>状态：{it.status}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
