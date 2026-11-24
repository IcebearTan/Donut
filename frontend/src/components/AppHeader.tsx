import { Menu, Moon, Settings, Sun, LogOut, ShieldCheck } from 'lucide-react'
import type { PortalAppItem, UserProfile } from '../api/client'

interface Props {
  user: UserProfile
  apps: PortalAppItem[]
  activeAppId: string
  theme: 'light' | 'dark'
  onSelectApp: (app: PortalAppItem) => void
  onToggleSidebar: () => void
  onToggleTheme: () => void
  onOpenSettings: () => void
  onLogout: () => void
}

export function AppHeader({
  user,
  apps,
  activeAppId,
  theme,
  onSelectApp,
  onToggleSidebar,
  onToggleTheme,
  onOpenSettings,
  onLogout,
}: Props) {
  return (
    <header
      className="h-14 shrink-0 px-3 sm:px-4 flex items-center justify-between gap-2 select-none"
      style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Left: mobile drawer toggle + App Switcher */}
      <div className="flex items-center gap-2 min-w-0">
        {activeAppId === 'donut' && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="会话列表"
            className="p-2 rounded-lg transition-colors cursor-pointer lg:hidden"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Menu size={18} />
          </button>
        )}

        <nav
          className="flex items-center p-1 rounded-xl gap-1 overflow-x-auto"
          style={{ background: 'var(--bg-elevated)' }}
        >
          {apps.map((app) => {
            const active = app.id === activeAppId
            const label = app.id === 'donut' ? user.assistant_name || app.shortName : app.shortName
            const icon = app.id === 'donut' ? user.assistant_emoji || app.emoji : app.emoji
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onSelectApp(app)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all cursor-pointer"
                style={{
                  background: active ? 'var(--bg-surface)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                }}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Right: Private space badge + Theme + Settings + Logout */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}
          title="独立私密空间：记忆与对话仅自己可见"
        >
          <ShieldCheck size={13} />
          <span>
            {user.avatar_emoji} {user.display_name}的空间
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
          className="p-2 rounded-lg transition-colors cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="空间设置"
          className="p-2 rounded-lg transition-colors cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Settings size={16} />
        </button>

        <button
          type="button"
          onClick={onLogout}
          title="退出登录"
          className="p-2 rounded-lg transition-colors cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
