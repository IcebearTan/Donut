import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api, type WorkbenchModuleItem } from '../../api/client'
import { HtmlMicroAppFrame } from './HtmlMicroAppFrame'
import { CardsTemplate } from './templates/CardsTemplate'
import { ChecklistTemplate } from './templates/ChecklistTemplate'
import { MarkdownTemplate } from './templates/MarkdownTemplate'
import { TableTemplate } from './templates/TableTemplate'

interface Props {
  module: WorkbenchModuleItem
  onToast?: (msg: string) => void
}

export function MicroAppHost({ module, onToast }: Props) {
  const [data, setData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (module.kind === 'html') {
      setLoading(false)
      return
    }
    setLoading(true)
    setErr('')
    try {
      const res = await api.getMicroApp(module.id)
      setData(res.data || {})
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载微应用失败')
    } finally {
      setLoading(false)
    }
  }, [module.id, module.kind])

  useEffect(() => {
    load()
  }, [load])

  async function handleSaveData(next: Record<string, unknown>) {
    setSaving(true)
    setErr('')
    try {
      const res = await api.saveMicroAppData(module.id, next)
      setData(res.data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存失败'
      setErr(msg)
      onToast?.(msg)
    } finally {
      setSaving(false)
    }
  }

  if (module.kind === 'html') {
    return <HtmlMicroAppFrame appId={module.id} onToast={onToast} />
  }

  if (loading) {
    return (
      <div
        className="rounded-3xl py-16 flex items-center justify-center gap-2 text-xs"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)',
        }}
      >
        <Loader2 size={15} className="animate-spin" />
        <span>正在加载「{module.name}」…</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {err && (
        <div
          className="px-4 py-2.5 rounded-2xl text-xs"
          style={{
            background: 'rgba(220,38,38,0.08)',
            color: 'var(--danger)',
            border: '1px solid rgba(220,38,38,0.2)',
          }}
        >
          {err}
        </div>
      )}

      {module.template === 'table' ? (
        <TableTemplate data={data} saving={saving} onSave={handleSaveData} onRefresh={load} />
      ) : module.template === 'cards' ? (
        <CardsTemplate data={data} saving={saving} onSave={handleSaveData} onRefresh={load} />
      ) : module.template === 'markdown' ? (
        <MarkdownTemplate data={data} saving={saving} onSave={handleSaveData} onRefresh={load} />
      ) : (
        <ChecklistTemplate data={data} saving={saving} onSave={handleSaveData} onRefresh={load} />
      )}
    </div>
  )
}
