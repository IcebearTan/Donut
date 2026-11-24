import { useEffect, useState } from 'react'
import { api, type LoginHintUser, type UserProfile } from '../api/client'
import { Lock, Moon, Sun } from 'lucide-react'

interface Props {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onLoggedIn: (user: UserProfile) => void
}

export function LoginView({ theme, onToggleTheme, onLoggedIn }: Props) {
  const [hints, setHints] = useState<LoginHintUser[]>([])
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api
      .getLoginHints()
      .then((res) => {
        setHints(res.users)
        if (res.users.length > 0) setName(res.users[0].display_name)
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !password) return
    setError('')
    setLoading(true)
    try {
      const res = await api.login(name.trim(), password)
      onLoggedIn(res.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-full flex flex-col items-center justify-center px-4 py-10 relative"
      style={{ background: 'var(--bg-page)' }}
    >
      <button
        type="button"
        onClick={onToggleTheme}
        title="切换亮色 / 暗色"
        className="absolute top-5 right-5 p-2 rounded-full transition-colors cursor-pointer"
        style={{
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}
      >
        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>

      <div
        className="w-full max-w-sm p-7 rounded-2xl"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-3"
            style={{ background: 'var(--bg-elevated)' }}
          >
            🍩
          </div>
          <h1 className="text-xl font-semibold tracking-tight">我们的空间</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            登录后进入你的专属陪伴与生活岛屿
          </p>
        </div>

        {hints.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            {hints.map((u) => {
              const selected = name === u.display_name
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setName(u.display_name)}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all cursor-pointer"
                  style={{
                    background: selected ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: selected ? 'var(--accent-contrast)' : 'var(--text-primary)',
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  }}
                >
                  <span>{u.avatar_emoji}</span>
                  <span>{u.display_name}</span>
                </button>
              )
            })}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              身份
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入名字"
              autoComplete="username"
              className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-colors"
              style={{
                background: 'var(--bg-page)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              暗号
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入登录暗号"
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-colors"
                style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <Lock
                size={14}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs px-1" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim() || !password}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-45 cursor-pointer mt-1"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
          >
            {loading ? '进入中…' : '进入空间'}
          </button>
        </form>
      </div>
    </div>
  )
}
