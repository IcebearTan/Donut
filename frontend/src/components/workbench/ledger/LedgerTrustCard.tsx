import { Database, Fingerprint, ScanLine, Server } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** What actually happens to the data, stated plainly, including the limits of the guarantees. */
const TRUST_ROWS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: Server,
    title: '传输',
    text: '速记文字、截图与账单只发往本门户自己的接口，不经过任何第三方 AI 或统计服务。',
  },
  {
    icon: Database,
    title: '存储',
    text: '保存在你账号专属的 workbench/ledger.db 独立数据库中（仅属主可读写），与另一个账号物理隔离。',
  },
  {
    icon: ScanLine,
    title: '截图',
    text: '只在内存中缩放识别，原图不写入磁盘；订单号、手机号、卡号尾号在入库前被剔除。',
  },
  {
    icon: Fingerprint,
    title: '去重',
    text: '账单去重只保存单向哈希指纹，原始交易单号不会写入数据库。',
  },
]

/** Honest data-flow card for 隐私与设置: where data goes, what is stripped, and what is not guaranteed. */
export function LedgerTrustCard() {
  return (
    <div
      data-testid="ledger-trust-card"
      className="rounded-2xl p-3.5 space-y-3"
      style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="text-xs font-medium">数据去了哪里</div>
      {TRUST_ROWS.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex gap-2.5 text-[12px] leading-relaxed">
          <Icon size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
          <div>
            <span className="font-medium">{title}：</span>
            <span style={{ color: 'var(--text-secondary)' }}>{text}</span>
          </div>
        </div>
      ))}
      <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        需要知道的边界：数据存放在这台自托管服务器上，拥有服务器管理员权限的人可以读取文件；传输是否加密取决于地址栏是否为
        https。
      </p>
    </div>
  )
}
