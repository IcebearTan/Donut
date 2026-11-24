export interface UserProfile {
  id: string
  display_name: string
  avatar_emoji: string
  assistant_name: string
  assistant_emoji?: string
}

export interface PersonaPreset {
  id: string
  label: string
  desc: string
  soul: string
}

export interface PersonaData {
  assistant_name: string
  assistant_emoji: string
  soul_md: string
  user_md: string
  presets: PersonaPreset[]
}

export interface LoginHintUser {
  id: string
  display_name: string
  avatar_emoji: string
}

export interface PortalAppItem {
  id: string
  name: string
  shortName: string
  emoji: string
  description: string
  type: 'internal' | 'link'
  path: string
  badge?: string
}

export interface ChatSession {
  id: string
  title: string
  space_type: string
  created_at: number
  updated_at: number
}

export interface ToolCallItem {
  id: string
  name: string
  status: 'running' | 'done' | string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  tools?: ToolCallItem[]
  images?: string[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    elapsed_ms?: number
    input_tokens_details?: { cached_tokens?: number }
  }
  created_at: number
  streaming?: boolean
  startedAt?: number
  deliveryStatus?: 'sending' | 'delivered' | 'failed'
}

export type StreamEvent =
  | { type: 'meta'; user_message_id: string; assistant_message_id: string; title: string; delivered_at?: number }
  | { type: 'heartbeat'; elapsed_ms: number }
  | { type: 'thinking'; delta: string }
  | { type: 'tool'; id: string; name: string; status: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; usage?: ChatMessage['usage'] }
  | { type: 'error'; message: string }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      if (err?.detail) detail = String(err.detail)
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  getLoginHints: () => request<{ users: LoginHintUser[] }>('/portal-api/auth/users'),
  login: (name: string, password: string) =>
    request<{ user: UserProfile }>('/portal-api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    }),
  logout: () => request<{ ok: boolean }>('/portal-api/auth/logout', { method: 'POST' }),
  me: () =>
    request<{ user: UserProfile; agent_id: string; apps: PortalAppItem[] }>('/portal-api/auth/me'),
  updateProfile: (payload: { display_name?: string; assistant_name?: string }) =>
    request<{ user: UserProfile }>('/portal-api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>('/portal-api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
  listSessions: () => request<{ sessions: ChatSession[] }>('/portal-api/sessions'),
  createSession: (title = '新对话') =>
    request<{ session: ChatSession }>('/portal-api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  renameSession: (id: string, title: string) =>
    request<{ ok: boolean; title: string }>(`/portal-api/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  deleteSession: (id: string) =>
    request<{ ok: boolean }>(`/portal-api/sessions/${id}`, { method: 'DELETE' }),
  getMessages: (id: string) =>
    request<{ messages: ChatMessage[] }>(`/portal-api/sessions/${id}/messages`),
  uploadImage: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ id: string; url: string }>('/portal-api/uploads', {
      method: 'POST',
      body: form,
    })
  },
  launchApp: (appId: string) =>
    request<{ url: string }>(`/portal-api/apps/${encodeURIComponent(appId)}/launch`),
  getPersona: () => request<PersonaData>('/portal-api/persona'),
  savePersona: (payload: {
    assistant_name: string
    assistant_emoji: string
    soul_md: string
    user_md: string
  }) =>
    request<{ user: UserProfile; soul_md: string; user_md: string }>('/portal-api/persona', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
}

export async function streamChat(
  params: { session_id: string; content: string; images: string[] },
  onEvent: (ev: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/portal-api/chat/stream', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  })
  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      if (err?.detail) detail = String(err.detail)
    } catch {
      // ignore
    }
    throw new Error(detail)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const block of parts) {
      const lines = block.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw) continue
        try {
          onEvent(JSON.parse(raw) as StreamEvent)
        } catch {
          // ignore malformed chunk
        }
      }
    }
  }
}
