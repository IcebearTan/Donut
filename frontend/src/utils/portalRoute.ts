import { useCallback, useEffect, useRef, useState } from 'react'
import type { SettingsSection } from '../components/ProfileSettingsView'

/**
 * Two-way sync between the portal navigation state and `window.location.hash`, so a refresh on
 * Workbench / Vault / Settings / an external app never falls back to the chat, and the browser
 * back / forward buttons move between views.
 *
 *   #chat | (empty)            -> { appId: 'donut' }
 *   #workbench[/<moduleId>]    -> { appId: 'workbench', workbenchModule }
 *   #vault                     -> { appId: 'vault' }
 *   #settings[/<section>]      -> { appId: 'settings', settingsSection }
 *   #app/<id>                  -> { appId: '<id>' }   (external app)
 */
export interface PortalRouteState {
  appId: string
  /** Enabled workbench module, or `null` for the workbench overview. */
  workbenchModule: string | null
  settingsSection: SettingsSection
}

/** Views rendered by the SPA itself; every other app id is an external app under `#app/<id>`. */
export const PORTAL_BUILTIN_APP_IDS: readonly string[] = ['donut', 'workbench', 'vault', 'settings']

/** Sections allowed in the hash; anything else resolves to the first one. */
const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'overview', 'assistant', 'skills', 'appearance', 'account',
]

/** sessionStorage fallback for contexts that lose the hash on reload. */
const ROUTE_STORAGE_KEY = 'donut_portal_route_v1'

export const LEDGER_UPDATED_EVENT = 'donut:ledger-updated'

/** Tells the visible Ledger views (and the Workbench hub) that entries were added from elsewhere. */
export function emitLedgerUpdated(): void {
  window.dispatchEvent(new CustomEvent(LEDGER_UPDATED_EVENT))
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

function isSettingsSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value)
}

const CHAT_ROUTE: PortalRouteState = { appId: 'donut', workbenchModule: null, settingsSection: 'overview' }

export function parsePortalHash(hash = window.location.hash): PortalRouteState {
  const [head, ...rest] = hash
    .replace(/^#\/?/, '')
    .split(/[?#]/, 1)[0]
    .split('/')
    .filter(Boolean)
    .map(decode)
  const sub = rest.join('/')

  switch (head) {
    case 'workbench':
      return { ...CHAT_ROUTE, appId: 'workbench', workbenchModule: sub || null }
    case 'vault':
      return { ...CHAT_ROUTE, appId: 'vault' }
    case 'settings':
      return { ...CHAT_ROUTE, appId: 'settings', settingsSection: isSettingsSection(sub) ? sub : 'overview' }
    case 'app':
      // Reserved words keep standing for their own route shape, never for an external app id.
      return sub && !PORTAL_BUILTIN_APP_IDS.includes(sub) && sub !== 'app'
        ? { ...CHAT_ROUTE, appId: sub }
        : CHAT_ROUTE
    default:
      return CHAT_ROUTE
  }
}

export function formatPortalHash(state: PortalRouteState): string {
  switch (state.appId) {
    case 'donut':
      return '#chat'
    case 'workbench':
      return state.workbenchModule
        ? `#workbench/${encodeURIComponent(state.workbenchModule)}`
        : '#workbench'
    case 'vault':
      return '#vault'
    case 'settings':
      return isSettingsSection(state.settingsSection) && state.settingsSection !== 'overview'
        ? `#settings/${state.settingsSection}`
        : '#settings'
    default:
      return `#app/${encodeURIComponent(state.appId)}`
  }
}

/** Pushes (or, with `replace`, rewrites) the hash for `state`; a no-op when it already matches. */
export function writePortalHash(state: PortalRouteState, replace = false): void {
  const next = formatPortalHash(state)
  try {
    sessionStorage.setItem(ROUTE_STORAGE_KEY, next)
  } catch {
    // storage disabled: the hash alone still carries the route
  }
  if (window.location.hash === next) return
  try {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', next)
  } catch {
    // Sandboxed contexts reject history.* — the hash assignment below fires `hashchange` instead.
    window.location.hash = next
  }
}

function sameRoute(a: PortalRouteState, b: PortalRouteState): boolean {
  return (
    a.appId === b.appId &&
    a.workbenchModule === b.workbenchModule &&
    a.settingsSection === b.settingsSection
  )
}

function readInitialRoute(): PortalRouteState {
  let hash = window.location.hash
  if (!hash) {
    try {
      hash = sessionStorage.getItem(ROUTE_STORAGE_KEY) || ''
    } catch {
      // ignore storage errors
    }
  }
  return parsePortalHash(hash)
}

/**
 * Owns the route state. `navigateTo` patches it and writes the hash (no history entry when
 * nothing changes); browser back / forward and hand-edited hashes flow back through `popstate` / `hashchange`.
 * Entering a different app resets that app's sub-view unless the patch sets it explicitly.
 */
export function usePortalRoute(): readonly [
  PortalRouteState,
  (next: Partial<PortalRouteState>, replace?: boolean) => void,
] {
  const [route, setRoute] = useState<PortalRouteState>(readInitialRoute)
  const routeRef = useRef(route)
  routeRef.current = route

  const commit = useCallback((next: PortalRouteState, replace: boolean) => {
    routeRef.current = next
    setRoute((prev) => (sameRoute(prev, next) ? prev : next))
    writePortalHash(next, replace)
  }, [])

  const navigateTo = useCallback(
    (next: Partial<PortalRouteState>, replace = false) => {
      const cur = routeRef.current
      const entersOtherApp = next.appId !== undefined && next.appId !== cur.appId
      const base: PortalRouteState = entersOtherApp
        ? { ...cur, workbenchModule: null, settingsSection: 'overview' }
        : cur
      commit({ ...base, ...next }, replace)
    },
    [commit],
  )

  useEffect(() => {
    const syncFromLocation = () => commit(parsePortalHash(window.location.hash), false)
    // `pushState` entries only announce themselves through `popstate`; hand-edited hashes and
    // the `location.hash` fallback fire both events, and `commit` ignores the duplicate.
    window.addEventListener('popstate', syncFromLocation)
    window.addEventListener('hashchange', syncFromLocation)
    return () => {
      window.removeEventListener('popstate', syncFromLocation)
      window.removeEventListener('hashchange', syncFromLocation)
    }
  }, [commit])

  return [route, navigateTo]
}
