import { Download, Share, Smartphone, X } from 'lucide-react'

interface Props {
  canNativeInstall: boolean
  isSecureOrigin: boolean
  onTriggerNativeInstall: () => void
  onClose: () => void
}

export function PwaInstallModal({
  canNativeInstall,
  isSecureOrigin,
  onTriggerNativeInstall,
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px] animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 space-y-4 animate-modal-in"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/icons/icon-192.png"
              alt="Donut"
              className="w-9 h-9 rounded-xl"
              style={{ border: '1px solid var(--border-subtle)' }}
            />
            <div>
              <h3 className="text-[15px] font-semibold leading-tight">安装 Donut 应用</h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                像原生 App 一样全屏沉浸聊天，无浏览器地址栏
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg sidebar-row pressable cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {!isSecureOrigin && (
          <div
            className="p-3 rounded-xl text-xs leading-relaxed"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            当前正通过临时 HTTP 地址访问；等域名备案通过、切回{' '}
            <code className="font-mono">https://icebear-yearning.fun</code> 后，系统浏览器即可激活完整的桌面图标与离线壳缓存。
          </div>
        )}

        {canNativeInstall ? (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              当前浏览器支持一键安装 PWA，安装后会直接出现在你的手机主屏幕或电脑应用列表中。
            </p>
            <button
              type="button"
              onClick={onTriggerNativeInstall}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 pressable cursor-pointer"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              <Download size={15} />
              <span>立即安装到设备</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <div
              className="p-3 rounded-xl space-y-1.5"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                className="font-medium flex items-center gap-1.5"
                style={{ color: 'var(--text-primary)' }}
              >
                <Smartphone size={13} />
                <span>鸿蒙 / 安卓浏览器</span>
              </div>
              <p className="leading-relaxed">
                点击浏览器底部或右上角菜单「···」→ 选择 <strong>「添加到主屏幕」</strong> 或{' '}
                <strong>「安装应用」</strong> 即可全屏使用。
              </p>
            </div>

            <div
              className="p-3 rounded-xl space-y-1.5"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                className="font-medium flex items-center gap-1.5"
                style={{ color: 'var(--text-primary)' }}
              >
                <Share size={13} />
                <span>iPhone / iPad (Safari)</span>
              </div>
              <p className="leading-relaxed">
                点击底部 <strong>「分享」</strong> 图标 → 往下滑选择{' '}
                <strong>「添加到主屏幕」</strong> → 点右上角「添加」。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
