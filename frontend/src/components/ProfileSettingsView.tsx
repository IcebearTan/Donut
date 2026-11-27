import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Check,
  Download,
  Flame,
  FolderArchive,
  FolderKanban,
  Layers,
  Loader2,
  LogOut,
  MessageSquare,
  Palette,
  Save,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react'
import {
  api,
  type ActivityDayItem,
  type AnnualActivityResponse,
  type PersonaPreset,
  type UserProfile,
} from '../api/client'
import { SkillsView } from './SkillsView'

export type SettingsSection = 'overview' | 'assistant' | 'skills' | 'appearance' | 'account'

interface Props {
  user: UserProfile
  theme: 'light' | 'dark'
  initialSection?: SettingsSection
  showInstallApp?: boolean
  onSetTheme: (t: 'light' | 'dark') => void
  onUserUpdated: (user: UserProfile) => void
  onNavigateVault: () => void
  onTeachInChat: () => void
  onChanged?: () => void
  onInstallApp?: () => void
  onLogout: () => void
}

const ASSISTANT_EMOJIS = ['🍩', '🐻', '🐱', '🐰', '🦊', '🍓', '🍑', '✨', '🌙', '🌿', '☕', '🫶']
const USER_EMOJIS = ['🐻', '🐰', '🐱', '🐶', '🦊', '🐼', '🐨', '🦄', '🌙', '☀️', '🍀', '⭐']
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

type HeatmapMetric = 'score' | 'turns' | 'tasks'

interface CalendarCell {
  date: string
  inYear: boolean
  month: number
  dayOfMonth: number
}

function buildYearWeeks(year: number): {
  weeks: CalendarCell[][]
  monthStarts: Array<{ weekIdx: number; label: string }>
} {
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const dec31 = new Date(Date.UTC(year, 11, 31))
  // Align start to Monday (Mon=0 ... Sun=6)
  const jan1Dow = (jan1.getUTCDay() + 6) % 7
  const start = new Date(jan1)
  start.setUTCDate(start.getUTCDate() - jan1Dow)

  const dec31Dow = (dec31.getUTCDay() + 6) % 7
  const end = new Date(dec31)
  end.setUTCDate(end.getUTCDate() + (6 - dec31Dow))

  const weeks: CalendarCell[][] = []
  const monthStarts: Array<{ weekIdx: number; label: string }> = []
  const seenMonths = new Set<number>()

  const cur = new Date(start)
  let weekIdx = 0
  while (cur <= end) {
    const week: CalendarCell[] = []
    for (let d = 0; d < 7; d++) {
      const y = cur.getUTCFullYear()
      const m = cur.getUTCMonth()
      const dom = cur.getUTCDate()
      const inYear = y === year
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(dom).padStart(2, '0')}`
      if (inYear && dom <= 7 && !seenMonths.has(m)) {
        seenMonths.add(m)
        monthStarts.push({ weekIdx, label: MONTH_LABELS[m] })
      }
      week.push({ date: iso, inYear, month: m, dayOfMonth: dom })
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    weeks.push(week)
    weekIdx++
  }

  return { weeks, monthStarts }
}

function metricLevel(day: ActivityDayItem | undefined, metric: HeatmapMetric): 0 | 1 | 2 | 3 | 4 {
  if (!day) return 0
  const val = metric === 'score' ? day.score : metric === 'turns' ? day.turns : day.tasks
  if (val <= 0) return 0
  if (val <= 2) return 1
  if (val <= 6) return 2
  if (val <= 14) return 3
  return 4
}

function formatChineseDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${y}年${m}月${d}日`
}

export function ProfileSettingsView({
  user,
  theme,
  initialSection = 'overview',
  showInstallApp,
  onSetTheme,
  onUserUpdated,
  onNavigateVault,
  onTeachInChat,
  onChanged,
  onInstallApp,
  onLogout,
}: Props) {
  const [section, setSection] = useState<SettingsSection>(initialSection)

  useEffect(() => {
    setSection(initialSection)
  }, [initialSection])

  // Overview / Annual Heatmap state
  const [activity, setActivity] = useState<AnnualActivityResponse | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined)
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [metric, setMetric] = useState<HeatmapMetric>('score')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const heatmapScrollRef = useRef<HTMLDivElement>(null)

  // Persona state
  const [assistantName, setAssistantName] = useState(user.assistant_name || 'Donut')
  const [assistantEmoji, setAssistantEmoji] = useState(user.assistant_emoji || '🍩')
  const [soulMd, setSoulMd] = useState('')
  const [userMd, setUserMd] = useState('')
  const [presets, setPresets] = useState<PersonaPreset[]>([])
  const [loadingPersona, setLoadingPersona] = useState(true)

  // Account state
  const [displayName, setDisplayName] = useState(user.display_name)
  const [avatarEmoji, setAvatarEmoji] = useState(user.avatar_emoji || '🐻')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')

  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [err, setErr] = useState('')

  const loadActivity = useCallback(async (yr?: number) => {
    setLoadingActivity(true)
    try {
      const res = await api.getAnnualActivity(yr)
      setActivity(res)
      setSelectedDate((prev) => (prev && prev.startsWith(`${res.year}-`) ? prev : res.today))
    } catch {
      // ignore
    } finally {
      setLoadingActivity(false)
    }
  }, [])

  useEffect(() => {
    loadActivity(selectedYear)
  }, [loadActivity, selectedYear])

  useEffect(() => {
    api
      .getPersona()
      .then((res) => {
        setAssistantName(res.assistant_name || 'Donut')
        setAssistantEmoji(res.assistant_emoji || '🍩')
        setSoulMd(res.soul_md || '')
        setUserMd(res.user_md || '')
        setPresets(res.presets || [])
      })
      .catch(() => {})
      .finally(() => setLoadingPersona(false))
  }, [])

  // Auto-scroll heatmap horizontally toward the current month on narrow viewports
  useEffect(() => {
    if (section !== 'overview' || !activity) return
    const el = heatmapScrollRef.current
    if (!el) return
    const monthNum = Number(activity.today.split('-')[1] || 12)
    const ratio = Math.max(0, Math.min(1, (monthNum - 2) / 10))
    el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) * ratio)
  }, [section, activity])

  const calYear = activity?.year || new Date().getFullYear()
  const { weeks, monthStarts } = useMemo(() => buildYearWeeks(calYear), [calYear])

  const activeDayInfo = selectedDate ? activity?.days[selectedDate] : undefined

  function applyPreset(preset: PersonaPreset) {
    const cleanName = assistantName.trim() || 'Donut'
    setSoulMd(preset.soul.replace(/^#\s+.+$/m, `# ${cleanName}`))
    setNotice(`已套用「${preset.label}」模板，点击下方保存生效`)
    setErr('')
  }

  async function handleSavePersona(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setNotice('')
    setErr('')
    try {
      const res = await api.savePersona({
        assistant_name: assistantName.trim() || 'Donut',
        assistant_emoji: assistantEmoji || '🍩',
        soul_md: soulMd,
        user_md: userMd,
      })
      onUserUpdated(res.user)
      setNotice('助手人设与偏好已保存，下一轮对话立即生效')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setNotice('')
    setErr('')
    try {
      const res = await api.updateProfile({
        display_name: displayName.trim(),
        avatar_emoji: avatarEmoji,
      })
      onUserUpdated(res.user)
      setNotice('个人资料已更新')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!curPw || !newPw) return
    if (newPw.length < 8) {
      setErr('新暗号至少需要 8 位')
      return
    }
    setSaving(true)
    setNotice('')
    setErr('')
    try {
      await api.changePassword(curPw, newPw)
      setCurPw('')
      setNewPw('')
      setNotice('登录暗号已更新')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '修改失败')
    } finally {
      setSaving(false)
    }
  }

  const navItems: Array<{ id: SettingsSection; label: string; desc: string; icon: React.ReactNode }> = [
    {
      id: 'overview',
      label: '个人主页与日历',
      desc: '年度活跃热力图与成长足迹',
      icon: <CalendarDays size={16} />,
    },
    {
      id: 'assistant',
      label: '助手定制与人设',
      desc: '形象、性格模板、SOUL 与偏好',
      icon: <Sparkles size={16} />,
    },
    {
      id: 'skills',
      label: '技能库',
      desc: '自进化技能与配套工具规则',
      icon: <Layers size={16} />,
    },
    {
      id: 'appearance',
      label: '外观与安装',
      desc: '明暗主题与 PWA 应用',
      icon: <Palette size={16} />,
    },
    {
      id: 'account',
      label: '账号与安全',
      desc: '称呼、头像与登录暗号',
      icon: <ShieldCheck size={16} />,
    },
  ]

  return (
    <div data-testid="profile-settings-page" className="chat-scroll flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-14">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">个人主页与设置</h1>
          <p className="text-[13.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
            查看你的年度陪伴足迹，深度定制专属助手人设与空间偏好
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Sticky Sub-Nav (Desktop) / Horizontal Tabs (Mobile) */}
          <nav className="lg:col-span-3 flex lg:flex-col gap-1.5 overflow-x-auto pb-1 lg:pb-0 lg:sticky lg:top-8">
            {navItems.map((item) => {
              const active = section === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`settings-nav-${item.id}`}
                  onClick={() => {
                    setSection(item.id)
                    setNotice('')
                    setErr('')
                  }}
                  className="flex items-center gap-3 px-3.5 py-2.5 lg:py-3 rounded-2xl text-left whitespace-nowrap lg:whitespace-normal transition-colors sidebar-row pressable cursor-pointer shrink-0 lg:w-full"
                  style={{
                    background: active ? 'var(--bg-sidebar)' : 'transparent',
                    border: `1px solid ${active ? 'var(--border-subtle)' : 'transparent'}`,
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  <span className="shrink-0 opacity-85">{item.icon}</span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium leading-tight">{item.label}</div>
                    <div
                      className="hidden lg:block text-[11.5px] mt-0.5 truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {item.desc}
                    </div>
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Right Spacious Workspace Canvas */}
          <div className="lg:col-span-9 space-y-5 min-w-0">
            {notice && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-2xl text-xs font-medium animate-msg-in"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--success)',
                  color: 'var(--success)',
                }}
              >
                <Check size={14} />
                <span>{notice}</span>
              </div>
            )}
            {err && (
              <div
                className="px-4 py-3 rounded-2xl text-xs font-medium animate-msg-in"
                style={{
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--danger)',
                  color: 'var(--danger)',
                }}
              >
                {err}
              </div>
            )}

            {/* ================= SECTION 1: OVERVIEW & 365-DAY HEATMAP ================= */}
            {section === 'overview' && (
              <div className="space-y-5 animate-msg-in">
                {/* Profile Hero Card */}
                <div
                  className="p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-3xl shrink-0"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      {user.avatar_emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-semibold truncate">{user.display_name}</h2>
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs"
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <span>{user.assistant_emoji || '🍩'}</span>
                          <span>
                            与 {user.assistant_name || 'Donut'} 相伴第{' '}
                            {activity?.summary.companion_days ?? 1} 天
                          </span>
                        </span>
                      </div>
                      <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                        专属独立空间 · 独立长期记忆、项目、技能库与隔离文件仓
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSection('assistant')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium sidebar-row pressable cursor-pointer"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Sparkles size={13} />
                      <span>定制助手人设</span>
                    </button>
                  </div>
                </div>

                {/* Annual KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div
                    className="p-4 rounded-2xl"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <MessageSquare size={12} />
                      <span>{calYear} 对话轮次</span>
                    </div>
                    <div className="text-2xl font-semibold mt-1.5 tabular-nums">
                      {activity?.summary.year_turns ?? 0}
                    </div>
                  </div>
                  <div
                    className="p-4 rounded-2xl"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <Wrench size={12} />
                      <span>{calYear} 处理任务</span>
                    </div>
                    <div className="text-2xl font-semibold mt-1.5 tabular-nums">
                      {activity?.summary.year_tasks ?? 0}
                    </div>
                  </div>
                  <div
                    className="p-4 rounded-2xl"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <CalendarDays size={12} />
                      <span>活跃天数</span>
                    </div>
                    <div className="text-2xl font-semibold mt-1.5 tabular-nums">
                      {activity?.summary.active_days ?? 0}
                      <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                        天
                      </span>
                    </div>
                  </div>
                  <div
                    className="p-4 rounded-2xl"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <Flame size={12} />
                      <span>连续活跃</span>
                    </div>
                    <div className="text-2xl font-semibold mt-1.5 tabular-nums">
                      {activity?.summary.current_streak ?? 0}
                      <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                        天（最长 {activity?.summary.longest_streak ?? 0}）
                      </span>
                    </div>
                  </div>
                </div>

                {/* 365-Day Annual Activity Heatmap Calendar */}
                <div
                  data-testid="annual-heatmap"
                  className="p-5 sm:p-6 rounded-3xl space-y-4"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[16px] font-semibold flex items-center gap-2">
                        <span>{calYear} 年度活跃日历</span>
                        {loadingActivity && <Loader2 size={14} className="animate-spin opacity-60" />}
                      </h3>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        点击任意日期方格，查看当天的对话轮次、处理任务数与聊过的主题
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Metric Switcher */}
                      <div
                        className="inline-flex p-0.5 rounded-xl text-xs"
                        style={{ background: 'var(--bg-elevated)' }}
                      >
                        {(
                          [
                            ['score', '综合活跃'],
                            ['turns', '对话轮次'],
                            ['tasks', '处理任务'],
                          ] as const
                        ).map(([mId, mLabel]) => (
                          <button
                            key={mId}
                            type="button"
                            onClick={() => setMetric(mId)}
                            className="px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
                            style={{
                              background: metric === mId ? 'var(--bg-surface)' : 'transparent',
                              color: metric === mId ? 'var(--text-primary)' : 'var(--text-muted)',
                              boxShadow: metric === mId ? 'var(--shadow-sm)' : 'none',
                            }}
                          >
                            {mLabel}
                          </button>
                        ))}
                      </div>

                      {/* Year Picker */}
                      {activity && activity.available_years.length > 1 && (
                        <select
                          value={calYear}
                          onChange={(e) => setSelectedYear(Number(e.target.value))}
                          className="px-2.5 py-1.5 rounded-xl text-xs outline-none cursor-pointer"
                          style={{
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {activity.available_years.map((yr) => (
                            <option key={yr} value={yr}>
                              {yr} 年
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Heatmap Grid */}
                  <div ref={heatmapScrollRef} className="overflow-x-auto pb-2">
                    <div className="inline-flex flex-col gap-1.5 min-w-max">
                      {/* Month labels aligned with week columns */}
                      <div className="flex items-center pl-7 relative h-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {monthStarts.map((ms) => (
                          <span
                            key={`${ms.label}-${ms.weekIdx}`}
                            style={{
                              position: 'absolute',
                              left: `${28 + ms.weekIdx * 15}px`,
                            }}
                          >
                            {ms.label}
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        {/* Weekday axis */}
                        <div
                          className="flex flex-col justify-between text-[10.5px] py-0.5 w-5 shrink-0 select-none"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span>一</span>
                          <span className="opacity-0">二</span>
                          <span>三</span>
                          <span className="opacity-0">四</span>
                          <span>五</span>
                          <span className="opacity-0">六</span>
                          <span>日</span>
                        </div>

                        {/* 53 week columns */}
                        <div className="flex gap-[3px]">
                          {weeks.map((week, wIdx) => (
                            <div key={wIdx} className="flex flex-col gap-[3px]">
                              {week.map((cell) => {
                                if (!cell.inYear) {
                                  return <div key={cell.date} className="w-[12px] h-[12px]" />
                                }
                                const info = activity?.days[cell.date]
                                const lvl = metricLevel(info, metric)
                                const isSelected = selectedDate === cell.date
                                const isToday = activity?.today === cell.date
                                return (
                                  <button
                                    key={cell.date}
                                    type="button"
                                    onClick={() => setSelectedDate(cell.date)}
                                    onMouseEnter={() => setSelectedDate(cell.date)}
                                    title={`${cell.date} · 对话 ${info?.turns || 0} 轮 · 任务 ${info?.tasks || 0} 次`}
                                    className="w-[12px] h-[12px] rounded-[3px] cursor-pointer transition-transform hover:scale-125"
                                    style={{
                                      background: `var(--heat-${lvl})`,
                                      outline: isSelected
                                        ? '2px solid var(--text-primary)'
                                        : isToday
                                          ? '1.5px solid var(--text-muted)'
                                          : 'none',
                                      outlineOffset: '1px',
                                    }}
                                  />
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Selected Day Inspector + Legend */}
                  <div
                    className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="text-[13.5px] font-medium flex items-center gap-2 flex-wrap">
                        <span>{selectedDate ? formatChineseDate(selectedDate) : '选择一天查看'}</span>
                        {selectedDate === activity?.today && (
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                          >
                            今天
                          </span>
                        )}
                      </div>
                      {activeDayInfo ? (
                        <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <div>
                            对话 <strong style={{ color: 'var(--text-primary)' }}>{activeDayInfo.turns}</strong> 轮 · 处理任务{' '}
                            <strong style={{ color: 'var(--text-primary)' }}>{activeDayInfo.tasks}</strong> 次
                          </div>
                          {activeDayInfo.topics.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {activeDayInfo.topics.map((t) => (
                                <span
                                  key={t}
                                  className="px-2 py-0.5 rounded-lg text-[11px]"
                                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          这一天安静休息，没有对话或任务记录
                        </div>
                      )}
                    </div>

                    {/* Legend */}
                    <div
                      className="flex items-center gap-1.5 text-[11px] shrink-0 select-none"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span>少</span>
                      {[0, 1, 2, 3, 4].map((lvl) => (
                        <span
                          key={lvl}
                          className="w-[11px] h-[11px] rounded-[3px] inline-block"
                          style={{ background: `var(--heat-${lvl})` }}
                        />
                      ))}
                      <span>多</span>
                    </div>
                  </div>
                </div>

                {/* Personal Workspace Assets Quick Links */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setSection('skills')}
                    className="p-4 rounded-2xl text-left flex items-center justify-between sidebar-row pressable cursor-pointer"
                    style={{
                      background: 'var(--bg-sidebar)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        已掌握技能
                      </div>
                      <div className="text-lg font-semibold mt-0.5 tabular-nums">
                        {activity?.summary.skills_count ?? 0} 项
                      </div>
                    </div>
                    <Sparkles size={18} style={{ color: 'var(--text-muted)' }} />
                  </button>

                  <button
                    type="button"
                    onClick={onNavigateVault}
                    className="p-4 rounded-2xl text-left flex items-center justify-between sidebar-row pressable cursor-pointer"
                    style={{
                      background: 'var(--bg-sidebar)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        隔离文件仓
                      </div>
                      <div className="text-lg font-semibold mt-0.5 tabular-nums">
                        {activity?.summary.vault_files_count ?? 0} 个文件
                      </div>
                    </div>
                    <FolderArchive size={18} style={{ color: 'var(--text-muted)' }} />
                  </button>

                  <div
                    className="p-4 rounded-2xl flex items-center justify-between"
                    style={{
                      background: 'var(--bg-sidebar)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        项目记忆空间
                      </div>
                      <div className="text-lg font-semibold mt-0.5 tabular-nums">
                        {activity?.summary.projects_count ?? 0} 个项目
                      </div>
                    </div>
                    <FolderKanban size={18} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              </div>
            )}

            {/* ================= SECTION 2: ASSISTANT PERSONA STUDIO ================= */}
            {section === 'assistant' && (
              <form onSubmit={handleSavePersona} className="space-y-5 animate-msg-in">
                {/* Live Preview Card */}
                <div
                  className="p-5 rounded-3xl flex items-center gap-4"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-4xl shrink-0"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {assistantEmoji || '🍩'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-semibold truncate">{assistantName || 'Donut'}</div>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      仅作用于 <strong>{user.display_name}</strong> 的专属助手，与另一半的人设、记忆和技能完全独立隔离。
                    </p>
                  </div>
                </div>

                {/* Identity Settings */}
                <div
                  className="p-5 sm:p-6 rounded-3xl space-y-5"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                        助手名字
                      </label>
                      <input
                        value={assistantName}
                        onChange={(e) => setAssistantName(e.target.value)}
                        maxLength={24}
                        placeholder="Donut"
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                        style={{
                          background: 'var(--bg-sidebar)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                        自定义头像 Emoji
                      </label>
                      <input
                        value={assistantEmoji}
                        onChange={(e) => setAssistantEmoji(e.target.value)}
                        maxLength={8}
                        placeholder="🍩"
                        className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                        style={{
                          background: 'var(--bg-sidebar)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      快捷选择形象
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ASSISTANT_EMOJIS.map((em) => {
                        const selected = assistantEmoji === em
                        return (
                          <button
                            key={em}
                            type="button"
                            onClick={() => setAssistantEmoji(em)}
                            className="w-10 h-10 rounded-2xl text-xl flex items-center justify-center pressable cursor-pointer transition-all"
                            style={{
                              background: selected ? 'var(--accent)' : 'var(--bg-sidebar)',
                              border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                            }}
                          >
                            {em}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Personality Presets */}
                  {presets.length > 0 && (
                    <div>
                      <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                        一键套用性格模板
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {presets.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => applyPreset(p)}
                            className="text-left p-3.5 rounded-2xl sidebar-row pressable cursor-pointer"
                            style={{
                              background: 'var(--bg-sidebar)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <div className="text-[13.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {p.label}
                            </div>
                            <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                              {p.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* SOUL.md & USER.md Editors */}
                <div
                  className="p-5 sm:p-6 rounded-3xl space-y-5"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        核心人设与沟通风格（SOUL.md）
                      </label>
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {soulMd.length} 字
                      </span>
                    </div>
                    <textarea
                      rows={9}
                      value={soulMd}
                      onChange={(e) => setSoulMd(e.target.value)}
                      disabled={loadingPersona}
                      placeholder="描述你希望助手如何称呼你、语气节奏、思考方式和雷区…"
                      className="w-full p-4 rounded-2xl text-[13.5px] leading-relaxed outline-none resize-y"
                      style={{
                        background: 'var(--bg-sidebar)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        关于我的长期偏好档案（USER.md）
                      </label>
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {userMd.length} 字
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={userMd}
                      onChange={(e) => setUserMd(e.target.value)}
                      disabled={loadingPersona}
                      placeholder="例如：你的专业方向、作息习惯、喜欢的输出结构、常用工具等…"
                      className="w-full p-4 rounded-2xl text-[13.5px] leading-relaxed outline-none resize-y"
                      style={{
                        background: 'var(--bg-sidebar)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving || loadingPersona}
                      data-testid="save-persona-btn"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium pressable cursor-pointer disabled:opacity-45"
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--accent-contrast)',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      <span>{saving ? '保存中…' : '保存助手人设'}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* ================= SECTION 2.5: SKILLS STUDIO ================= */}
            {section === 'skills' && (
              <div className="animate-msg-in">
                <SkillsView
                  embedded
                  user={user}
                  onTeachInChat={onTeachInChat}
                  onChanged={onChanged}
                />
              </div>
            )}

            {/* ================= SECTION 3: APPEARANCE & PWA ================= */}
            {section === 'appearance' && (
              <div className="space-y-5 animate-msg-in">
                <div
                  className="p-5 sm:p-6 rounded-3xl space-y-4"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <h3 className="text-[16px] font-semibold">界面主题</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      随时切换极简浅色或深色模式，后续将开放更多双人主题皮肤
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {(
                      [
                        {
                          id: 'light' as const,
                          title: '极简亮色',
                          desc: '纸感留白 · 高对比墨黑用户气泡',
                          bg: '#ffffff',
                          side: '#f9f9f8',
                          bubble: '#202024',
                          asst: '#f5f5f2',
                        },
                        {
                          id: 'dark' as const,
                          title: '极简暗色',
                          desc: '深夜护眼 · 暖炭灰与象牙白气泡',
                          bg: '#212121',
                          side: '#171717',
                          bubble: '#eae8e3',
                          asst: '#28282b',
                        },
                      ]
                    ).map((item) => {
                      const active = theme === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSetTheme(item.id)}
                          className="p-4 rounded-2xl text-left space-y-3 pressable cursor-pointer transition-all"
                          style={{
                            background: 'var(--bg-sidebar)',
                            border: `2px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                          }}
                        >
                          {/* Mini visual preview */}
                          <div
                            className="h-24 rounded-xl overflow-hidden flex border"
                            style={{ background: item.bg, borderColor: 'var(--border-subtle)' }}
                          >
                            <div className="w-1/4 h-full" style={{ background: item.side }} />
                            <div className="flex-1 p-3 flex flex-col justify-center gap-2">
                              <div
                                className="w-2/3 h-3 rounded-full"
                                style={{ background: item.asst }}
                              />
                              <div
                                className="w-1/2 h-3 rounded-full self-end"
                                style={{ background: item.bubble }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold">{item.title}</div>
                              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {item.desc}
                              </div>
                            </div>
                            {active && (
                              <span
                                className="w-6 h-6 rounded-full flex items-center justify-center"
                                style={{
                                  background: 'var(--accent)',
                                  color: 'var(--accent-contrast)',
                                }}
                              >
                                <Check size={13} />
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {showInstallApp && onInstallApp && (
                  <div
                    className="p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    style={{
                      background: 'var(--bg-sidebar)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <h3 className="text-[15px] font-semibold">安装为手机 / 桌面应用（PWA）</h3>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        添加到主屏幕后拥有全屏沉浸体验，启动更快，更像原生 App
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onInstallApp}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-medium pressable cursor-pointer shrink-0"
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--accent-contrast)',
                      }}
                    >
                      <Download size={14} />
                      <span>查看安装引导</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ================= SECTION 4: ACCOUNT & SECURITY ================= */}
            {section === 'account' && (
              <div className="space-y-5 animate-msg-in">
                <form
                  onSubmit={handleSaveProfile}
                  className="p-5 sm:p-6 rounded-3xl space-y-5"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <h3 className="text-[16px] font-semibold">个人资料</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      修改你在登录卡片与侧边栏中显示的称呼与头像
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      我的头像
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {USER_EMOJIS.map((em) => {
                        const selected = avatarEmoji === em
                        return (
                          <button
                            key={em}
                            type="button"
                            onClick={() => setAvatarEmoji(em)}
                            className="w-10 h-10 rounded-2xl text-xl flex items-center justify-center pressable cursor-pointer"
                            style={{
                              background: selected ? 'var(--accent)' : 'var(--bg-sidebar)',
                              border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                            }}
                          >
                            {em}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      我的称呼
                    </label>
                    <div className="flex gap-2.5 max-w-md">
                      <input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        maxLength={24}
                        className="flex-1 px-3.5 py-2.5 rounded-xl text-sm outline-none"
                        style={{
                          background: 'var(--bg-sidebar)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        type="submit"
                        disabled={saving || !displayName.trim()}
                        className="px-5 py-2.5 rounded-xl text-xs font-medium pressable cursor-pointer shrink-0 disabled:opacity-45"
                        style={{
                          background: 'var(--accent)',
                          color: 'var(--accent-contrast)',
                        }}
                      >
                        保存资料
                      </button>
                    </div>
                  </div>
                </form>

                <form
                  onSubmit={handleSavePassword}
                  className="p-5 sm:p-6 rounded-3xl space-y-4"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <h3 className="text-[16px] font-semibold">修改登录暗号</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      用于保护你的独立工作区、私人对话记录与隔离文件仓
                    </p>
                  </div>
                  <div className="space-y-3 max-w-md">
                    <input
                      type="password"
                      value={curPw}
                      onChange={(e) => setCurPw(e.target.value)}
                      placeholder="当前暗号"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                      style={{
                        background: 'var(--bg-sidebar)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <input
                      type="password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="新暗号（至少 8 位）"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
                      style={{
                        background: 'var(--bg-sidebar)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={saving || !curPw || newPw.length < 8}
                      className="px-5 py-2.5 rounded-xl text-xs font-medium pressable cursor-pointer disabled:opacity-40"
                      style={{
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      更新暗号
                    </button>
                  </div>
                </form>

                <div
                  className="p-5 rounded-3xl flex items-center justify-between gap-4"
                  style={{
                    background: 'var(--bg-sidebar)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div className="text-sm font-medium">退出当前账号</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      清除本机登录态，不会删除云端对话和文件
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium pressable cursor-pointer"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--danger)',
                    }}
                  >
                    <LogOut size={14} />
                    <span>退出登录</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
