import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { api } from '../../api/client'
import {
  buildBridgeInjection,
  injectIntoHtml,
  readCurrentThemeSnapshot,
} from './htmlBridge'

interface Props {
  appId: string
  onToast?: (msg: string) => void
}

export function HtmlMicroAppFrame({ appId, onToast }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const bridgeTokenRef = useRef<string>(
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
  )
  const [rawHtml, setRawHtml] = useState('')
  const [initialData, setInitialData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)

  const loadHtml = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await api.getMicroAppHtml(appId)
      bridgeTokenRef.current = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      setRawHtml(res.html)
      setInitialData(res.data || {})
      setReloadNonce((n) => n + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载 HTML 微应用失败')
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => {
    loadHtml()
  }, [loadHtml])

  const srcDoc = useMemo(() => {
    if (!rawHtml) return ''
    const snapshot = readCurrentThemeSnapshot()
    const snippet = buildBridgeInjection(
      appId,
      bridgeTokenRef.current,
      initialData,
      snapshot,
    )
    return injectIntoHtml(rawHtml, snippet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, rawHtml, initialData, reloadNonce])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const win = iframeRef.current?.contentWindow
      if (!win) return
      const snap = readCurrentThemeSnapshot()
      win.postMessage(
        {
          channel: 'donut-microapp',
          token: bridgeTokenRef.current,
          type: 'donut:theme',
          theme: snap.theme,
          vars: snap.vars,
        },
        '*',
      )
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    async function onMessage(ev: MessageEvent) {
      const win = iframeRef.current?.contentWindow
      if (!win || ev.source !== win) return
      const msg = ev.data
      if (
        !msg ||
        msg.channel !== 'donut-microapp' ||
        msg.appId !== appId ||
        msg.token !== bridgeTokenRef.current
      ) {
        return
      }
      if (msg.type === 'app:toast') {
        const text = String(msg.payload?.message || '').trim()
        if (text) onToast?.(text.slice(0, 80))
        return
      }
      const reqId = msg.reqId
      if (!reqId) return
      try {
        if (msg.type === 'app:getData') {
          const res = await api.getMicroAppData(appId)
          win.postMessage(
            { channel: 'donut-microapp', token: bridgeTokenRef.current, reqId, result: res.data },
            '*',
          )
        } else if (msg.type === 'app:setData') {
          const payloadData =
            msg.payload?.data && typeof msg.payload.data === 'object' && !Array.isArray(msg.payload.data)
              ? (msg.payload.data as Record<string, unknown>)
              : null
          if (!payloadData) throw new Error('Data must be a JSON object')
          const res = await api.saveMicroAppData(appId, payloadData)
          win.postMessage(
            { channel: 'donut-microapp', token: bridgeTokenRef.current, reqId, result: res.data },
            '*',
          )
        }
      } catch (e) {
        win.postMessage(
          {
            channel: 'donut-microapp',
            token: bridgeTokenRef.current,
            reqId,
            error: e instanceof Error ? e.message : 'Bridge error',
          },
          '*',
        )
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [appId, onToast])

  return (
    <div data-testid={`microapp-html-${appId}`} className="space-y-3 animate-msg-in">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <ShieldCheck size={13} />
          <span>受控沙箱微应用 · 仅读写本应用隔离数据</span>
        </div>
        <button
          type="button"
          onClick={loadHtml}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sidebar-row pressable cursor-pointer"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          <span>重载应用</span>
        </button>
      </div>

      {err ? (
        <div
          className="px-4 py-3 rounded-2xl text-xs"
          style={{
            background: 'rgba(220,38,38,0.08)',
            color: 'var(--danger)',
            border: '1px solid rgba(220,38,38,0.2)',
          }}
        >
          {err}
        </div>
      ) : loading && !srcDoc ? (
        <div
          className="rounded-3xl py-16 flex items-center justify-center gap-2 text-xs"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          <Loader2 size={15} className="animate-spin" />
          <span>正在加载沙箱微应用…</span>
        </div>
      ) : (
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <iframe
            ref={iframeRef}
            key={`${appId}-${reloadNonce}`}
            title={`microapp-${appId}`}
            sandbox="allow-scripts allow-forms"
            srcDoc={srcDoc}
            className="w-full min-h-[540px] border-0 block"
          />
        </div>
      )}
    </div>
  )
}
