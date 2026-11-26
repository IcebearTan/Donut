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

export interface CompanionConnectionItem {
  id: string
  label: string
  online: boolean
}

export interface CompanionActivityItem {
  id: string
  kind: 'tool' | 'chat' | 'persona' | string
  text: string
  at: number
}

export interface SkillItem {
  id: string
  name: string
  description: string
  updated_at: number
  size?: number
}

export interface SkillDetail extends SkillItem {
  content: string
}

export interface ToolScriptItem {
  name: string
  size: number
  updated_at: number
}

export interface VaultFileItem {
  scope: 'inbox' | 'artifacts' | 'archive'
  path: string
  name: string
  ext: string
  size: number
  updated_at: number
  url: string
}

export interface VaultFilesResponse {
  inbox: VaultFileItem[]
  artifacts: VaultFileItem[]
  archive: VaultFileItem[]
  archive_folders?: string[]
  total_size?: number
}

export interface ActivityDayItem {
  date: string
  turns: number
  tasks: number
  score: number
  level: 0 | 1 | 2 | 3 | 4
  topics: string[]
}

export interface AnnualActivityResponse {
  year: number
  today: string
  available_years: number[]
  summary: {
    year_turns: number
    year_tasks: number
    active_days: number
    current_streak: number
    longest_streak: number
    companion_days: number
    total_sessions: number
    projects_count: number
    skills_count: number
    vault_files_count: number
  }
  days: Record<string, ActivityDayItem>
}

export interface UploadedAttachment {
  id: string
  name: string
  url: string
  is_image: boolean
  size: number
  ext: string
}

export interface CompanionStatus {
  gateway_online: boolean
  model_label: string
  connections: CompanionConnectionItem[]
  stats: {
    today_turns: number
    total_sessions: number
    last_active_at: number | null
    projects_count?: number
    skills_count?: number
    vault_files_count?: number
  }
  skills?: SkillItem[]
  activities: CompanionActivityItem[]
}

export interface ProjectItem {
  id: string
  slug: string
  name: string
  emoji: string
  summary: string
  session_count: number
  created_at: number
  updated_at: number
}

export interface ProjectDetail extends ProjectItem {
  brief_md: string
  memory_md: string
  memory_updated_at?: number | null
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
  project_id?: string | null
  is_main?: number
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
  | { type: 'title'; title: string }
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
  updateProfile: (payload: {
    display_name?: string
    assistant_name?: string
    avatar_emoji?: string
  }) =>
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
  createSession: (title = '新对话', project_id?: string | null) =>
    request<{ session: ChatSession }>('/portal-api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title, project_id: project_id || null }),
    }),
  renameSession: (id: string, title: string) =>
    request<{ ok: boolean; title: string }>(`/portal-api/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  moveSessionToProject: (id: string, project_id: string | null) =>
    request<{ ok: boolean; title: string; project_id: string | null; session: ChatSession }>(
      `/portal-api/sessions/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ project_id }),
      },
    ),
  autoTitleSession: (id: string) =>
    request<{ ok: boolean; title: string }>(`/portal-api/sessions/${id}/auto-title`, {
      method: 'POST',
    }),
  deleteSession: (id: string) =>
    request<{ ok: boolean }>(`/portal-api/sessions/${id}`, { method: 'DELETE' }),
  getMessages: (id: string) =>
    request<{ messages: ChatMessage[] }>(`/portal-api/sessions/${id}/messages`),
  uploadImage: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<UploadedAttachment>('/portal-api/uploads', {
      method: 'POST',
      body: form,
    })
  },
  uploadVaultFile: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<UploadedAttachment>('/portal-api/vault/upload', {
      method: 'POST',
      body: form,
    })
  },
  listVaultFiles: () => request<VaultFilesResponse>('/portal-api/vault/files'),
  deleteVaultFile: (scope: 'inbox' | 'artifacts' | 'archive', filePath: string) =>
    request<{ ok: boolean }>(
      `/portal-api/vault/files/${scope}/${filePath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`,
      { method: 'DELETE' },
    ),
  listSkills: () => request<{ skills: SkillItem[]; tools?: ToolScriptItem[] }>('/portal-api/skills'),
  getSkill: (id: string) =>
    request<{ skill: SkillDetail }>(`/portal-api/skills/${encodeURIComponent(id)}`),
  saveSkill: (id: string, content: string) =>
    request<{ skill: SkillDetail }>(`/portal-api/skills/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  deleteSkill: (id: string) =>
    request<{ ok: boolean }>(`/portal-api/skills/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  getAnnualActivity: (year?: number) =>
    request<AnnualActivityResponse>(
      year ? `/portal-api/activity/year?year=${year}` : '/portal-api/activity/year',
    ),
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
  getStatus: () => request<CompanionStatus>('/portal-api/status'),
  listProjects: () => request<{ projects: ProjectItem[] }>('/portal-api/projects'),
  createProject: (payload: {
    name: string
    emoji: string
    summary: string
    brief_md?: string
  }) =>
    request<{ project: ProjectDetail }>('/portal-api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getProject: (id: string) => request<{ project: ProjectDetail }>(`/portal-api/projects/${id}`),
  updateProject: (
    id: string,
    payload: {
      name?: string
      emoji?: string
      summary?: string
      brief_md?: string
      memory_md?: string
    },
  ) =>
    request<{ project: ProjectDetail }>(`/portal-api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/portal-api/projects/${id}`, { method: 'DELETE' }),
  distillProject: (id: string, session_id: string) =>
    request<{ ok: boolean; appended: string; memory_md: string }>(
      `/portal-api/projects/${id}/distill`,
      {
        method: 'POST',
        body: JSON.stringify({ session_id }),
      },
    ),
}

export async function streamChat(
  params: { session_id: string; content: string; images: string[]; attachments?: string[] },
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
