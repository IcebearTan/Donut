import { useEffect, useState } from 'react'
import { X, Check, Sparkles, SlidersHorizontal, ShieldCheck } from 'lucide-react'
import { api, type PersonaPreset, type UserProfile } from '../api/client'

interface Props {
  user: UserProfile
  theme: 'light' | 'dark'
  initialTab?: 'persona' | 'account'
  onSetTheme: (t: 'light' | 'dark') => void
  onUserUpdated: (user: UserProfile) => void
  onClose: () => void
}

const EMOJI_CHOICES = ['🍩', '🐻', '🐱', '🐰', '🦊', '🍓', '🍑', '✨', '🌙', '🌿', '☕', '🫶']

export function SettingsModal({
  user,
  theme,
  initialTab = 'persona',
  onSetTheme,
  onUserUpdated,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'persona' | 'account'>(initialTab)

  // Persona state
  const [assistantName, setAssistantName] = useState(user.assistant_name || 'Donut')
  const [assistantEmoji, setAssistantEmoji] = useState(user.assistant_emoji || '🍩')
  const [soulMd, setSoulMd] = useState('')
  const [userMd, setUserMd] = useState('')
  const [presets, setPresets] = useState<PersonaPreset[]>([])
  const [loadingPersona, setLoadingPersona] = useState(true)

  // Account state
  const [displayName, setDisplayName] = useState(user.display_name)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')

  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

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

  function applyPreset(preset: PersonaPreset) {
    const cleanName = assistantName.trim() || 'Donut'
    setSoulMd(preset.soul.replace(/^#\s+.+$/m, `# ${cleanName}`))
    setMsg(`已套用「${preset.label}」模板，点击下方保存生效`)
    setErr('')
  }

  async function handleSavePersona(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    setErr('')
    setSaving(true)
    try {
      const res = await api.savePersona({
        assistant_name: assistantName.trim() || 'Donut',
        assistant_emoji: assistantEmoji || '🍩',
        soul_md: soulMd,
        user_md: userMd,
      })
      onUserUpdated(res.user)
      setMsg('助手设定已保存，下一轮对话立即生效')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    setErr('')
    setSaving(true)
    try {
      const res = await api.updateProfile({
        display_name: displayName.trim(),
      })
      onUserUpdated(res.user)
      setMsg('称呼已保存')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!curPw || !newPw) return
    if (newPw.length < 8) {
      setErr('新暗号至少需要 8 位')
      return
    }
    setMsg('')
    setErr('')
    setSaving(true)
    try {
      await api.changePassword(curPw, newPw)
      setCurPw('')
      setNewPw('')
      setMsg('登录暗号已更新')
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '修改失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px] animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-modal-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">空间与助手设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="grid grid-cols-2 p-1 rounded-xl gap-1"
          style={{ background: 'var(--bg-elevated)' }}
        >
          <button
            type="button"
            onClick={() => {
              setTab('persona')
              setMsg('')
              setErr('')
            }}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs sm:text-sm font-medium cursor-pointer transition-all"
            style={{
              background: tab === 'persona' ? 'var(--bg-surface)' : 'transparent',
              color: tab === 'persona' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: tab === 'persona' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            <Sparkles size={14} />
            <span>我的助手人设</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('account')
              setMsg('')
              setErr('')
            }}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs sm:text-sm font-medium cursor-pointer transition-all"
            style={{
              background: tab === 'account' ? 'var(--bg-surface)' : 'transparent',
              color: tab === 'account' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: tab === 'account' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            <SlidersHorizontal size={14} />
            <span>账号与外观</span>
          </button>
        </div>

        {tab === 'persona' ? (
          <form onSubmit={handleSavePersona} className="space-y-4">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
              }}
            >
              <ShieldCheck size={14} className="shrink-0" />
              <span>
                仅作用于 <strong>{user.display_name}</strong> 的专属助手，与另一半的人设和记忆完全独立。
              </span>
            </div>

            {/* Name & Emoji */}
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  助手名字（默认 Donut）
                </label>
                <input
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  maxLength={24}
                  placeholder="Donut"
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--bg-page)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  助手头像
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI_CHOICES.map((em) => {
                    const selected = assistantEmoji === em
                    return (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setAssistantEmoji(em)}
                        className="w-9 h-9 rounded-xl text-lg flex items-center justify-center cursor-pointer transition-all"
                        style={{
                          background: selected ? 'var(--accent)' : 'var(--bg-elevated)',
                          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                        }}
                      >
                        {em}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Personality presets */}
            {presets.length > 0 && (
              <div>
                <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  快速套用性格模板
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="text-left p-2.5 rounded-xl transition-colors cursor-pointer"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {p.label}
                      </div>
                      <div className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                        {p.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SOUL.md */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                人物设定与说话风格（SOUL.md）
              </label>
              <textarea
                rows={5}
                value={soulMd}
                onChange={(e) => setSoulMd(e.target.value)}
                disabled={loadingPersona}
                placeholder="描述你希望助手怎么和你交流、性格特点、称呼习惯等…"
                className="w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm leading-relaxed outline-none resize-y"
                style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* USER.md */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                关于我（USER.md，选填）
              </label>
              <textarea
                rows={3}
                value={userMd}
                onChange={(e) => setUserMd(e.target.value)}
                disabled={loadingPersona}
                placeholder="例如：我的专业/工作方向、作息习惯、偏好精简还是详细回复…"
                className="w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm leading-relaxed outline-none resize-y"
                style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={saving || loadingPersona}
              className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-45 cursor-pointer"
              style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
            >
              {saving ? '保存中…' : '保存我的助手设定'}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            {/* Theme picker */}
            <div>
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                外观主题（后续将新增奶油岛屿风）
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['light', 'dark'] as const).map((t) => {
                  const active = theme === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onSetTheme(t)}
                      className="py-2 px-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                      style={{
                        background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                        color: active ? 'var(--accent-contrast)' : 'var(--text-primary)',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      {active && <Check size={14} />}
                      <span>{t === 'light' ? '极简亮色' : '极简暗色'}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Display Name */}
            <form
              onSubmit={saveProfile}
              className="space-y-3 pt-3"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                我的登录称呼
              </div>
              <div className="flex gap-2">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--bg-page)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-xs font-medium cursor-pointer shrink-0"
                  style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
                >
                  保存
                </button>
              </div>
            </form>

            {/* Password */}
            <form
              onSubmit={savePassword}
              className="space-y-2.5 pt-3"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                修改登录暗号
              </div>
              <input
                type="password"
                value={curPw}
                onChange={(e) => setCurPw(e.target.value)}
                placeholder="当前暗号"
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="新暗号（至少 8 位）"
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="submit"
                disabled={saving || !curPw || newPw.length < 8}
                className="px-4 py-2 rounded-xl text-xs font-medium disabled:opacity-40 cursor-pointer"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                更新暗号
              </button>
            </form>
          </div>
        )}

        {msg && <p className="text-xs" style={{ color: 'var(--success)' }}>{msg}</p>}
        {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
      </div>
    </div>
  )
}
