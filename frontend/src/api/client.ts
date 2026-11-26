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

export type CronSchedule =
  | { kind: 'cron'; expr: string; tz?: string }
  | { kind: 'every'; everyMs: number; anchorMs?: number }
  | { kind: 'at'; at: string }

export interface CronJobItem {
  id: string
  name: string
  description: string
  enabled: boolean
  is_system: boolean
  agent_id: string
  schedule: CronSchedule
  message: string
  payload_kind: string
  session_target: string
  delete_after_run: boolean
  created_at?: number | null
  updated_at?: number | null
  next_run_at?: number | null
  last_run_at?: number | null
  last_status?: string | null
  last_duration_ms?: number | null
  last_error?: string | null
  delivery_warning?: string | null
  consecutive_errors: number
}

export interface CronSchedulerStatus {
  enabled: boolean
  triggers_enabled: boolean
  next_wake_at?: number | null
}

export interface CronRunEntry {
  id: string
  job_id: string
  job_name: string
  ts?: number | null
  run_at?: number | null
  duration_ms?: number | null
  status: string
  summary: string
  error?: string | null
  model?: string | null
  provider?: string | null
  next_run_at?: number | null
}

export interface ReimbursementAttachment {
  path: string
  name: string
  url: string
  ext: string
}

export interface ReimbursementItem {
  row_index: number
  fingerprint: string
  spend_date: string
  month: string
  title: string
  platform: string
  amount: number
  has_invoice: string
  has_order: string
  has_payment: string
  material_status: string
  claim_status: string
  note: string
  attachment_path: string
  attachments: ReimbursementAttachment[]
}

export interface ReimbursementListResponse {
  ledger_path: string
  items: ReimbursementItem[]
  summary: {
    total_count: number
    active_total: number
    pending_submit_total: number
    pending_submit_count: number
    in_flight_total: number
    in_flight_count: number
    settled_total: number
    settled_count: number
    cancelled_count: number
  }
  facets: {
    months: string[]
    platforms: string[]
    claim_statuses: string[]
    material_statuses: string[]
    doc_checks: string[]
  }
}

export type FocusUrgency = 'must' | 'soon' | 'plan'
export type FocusTagColor = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet'

export interface FocusExternalLink {
  id: string
  label: string
  url: string
}

export interface FocusItem {
  id: string
  title: string
  urgency: FocusUrgency
  tag: string
  tag_color: FocusTagColor
  countdown: string
  progress: string
  source_url: string
  done: boolean
  created_at: number
  updated_at: number
}

export interface FocusState {
  updated_at: number
  external_links: FocusExternalLink[]
  items: FocusItem[]
  summary: {
    total: number
    done: number
    remaining: number
    must: number
    soon: number
    plan: number
  }
}

export interface WorkbenchModuleItem {
  id: string
  kind: 'core' | 'builtin' | 'template' | 'html'
  template?: 'checklist' | 'table' | 'cards' | 'markdown' | null
  name: string
  description: string
  icon: string
  enabled: boolean
  removable: boolean
  order?: number
}

export interface WorkbenchModulesResponse {
  core: WorkbenchModuleItem[]
  modules: WorkbenchModuleItem[]
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

export interface VaultFolderItem {
  scope: 'inbox' | 'artifacts' | 'archive'
  path: string
  name: string
  file_count: number
  size: number
  updated_at: number
}

export interface VaultBrowseResponse {
  scope: 'inbox' | 'artifacts' | 'archive'
  dir: string
  breadcrumbs: Array<{ name: string; dir: string }>
  folders: VaultFolderItem[]
  files: VaultFileItem[]
  summary: {
    counts: Record<'inbox' | 'artifacts' | 'archive', number>
    total_files: number
    total_size: number
    archive_categories: Array<{ name: string; path: string; file_count: number; size: number }>
  }
}

export interface ActiveRunSnapshot {
  session_id: string
  user_message_id: string
  assistant_message_id: string
  title: string
  started_at: number
  content: string
  thinking: string
  tools: ToolCallItem[]
  finished: boolean
  error?: string | null
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
  | { type: 'snapshot'; run: ActiveRunSnapshot }
  | { type: 'idle' }
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
    request<{ messages: ChatMessage[]; active_run?: ActiveRunSnapshot | null }>(
      `/portal-api/sessions/${id}/messages`,
    ),
  stopSessionRun: (id: string) =>
    request<{ ok: boolean; stopped: boolean }>(`/portal-api/sessions/${id}/stop`, {
      method: 'POST',
    }),
  uploadImage: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<UploadedAttachment>('/portal-api/uploads', {
      method: 'POST',
      body: form,
    })
  },
  uploadVaultFile: async (
    file: File,
    opts?: { scope?: 'inbox' | 'artifacts' | 'archive'; dir?: string },
  ) => {
    const form = new FormData()
    form.append('file', file)
    const qs = new URLSearchParams()
    if (opts?.scope) qs.set('scope', opts.scope)
    if (opts?.dir) qs.set('dir', opts.dir)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return request<UploadedAttachment>(`/portal-api/vault/upload${suffix}`, {
      method: 'POST',
      body: form,
    })
  },
  listVaultFiles: () => request<VaultFilesResponse>('/portal-api/vault/files'),
  browseVault: (scope: 'inbox' | 'artifacts' | 'archive', dir = '') =>
    request<VaultBrowseResponse>(
      `/portal-api/vault/browse?scope=${encodeURIComponent(scope)}&dir=${encodeURIComponent(dir)}`,
    ),
  searchVault: (q: string) =>
    request<{ files: VaultFileItem[]; folders: VaultFolderItem[] }>(
      `/portal-api/vault/search?q=${encodeURIComponent(q)}`,
    ),
  createVaultFolder: (scope: 'inbox' | 'artifacts' | 'archive', dir: string, name: string) =>
    request<{ ok: boolean; folder: { scope: string; path: string; name: string } }>(
      '/portal-api/vault/folders',
      {
        method: 'POST',
        body: JSON.stringify({ scope, dir, name }),
      },
    ),
  deleteVaultFolder: (scope: 'inbox' | 'artifacts' | 'archive', folderPath: string) =>
    request<{ ok: boolean }>(
      `/portal-api/vault/folders/${scope}/${folderPath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`,
      { method: 'DELETE' },
    ),
  moveVaultFile: (payload: {
    from_scope: 'inbox' | 'artifacts' | 'archive'
    from_path: string
    to_scope: 'inbox' | 'artifacts' | 'archive'
    to_dir: string
    new_name?: string
  }) =>
    request<{ ok: boolean; file: { scope: string; path: string; name: string } }>(
      '/portal-api/vault/move',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
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
  listCronJobs: () =>
    request<{ scheduler: CronSchedulerStatus; jobs: CronJobItem[] }>('/portal-api/cron/jobs'),
  createCronJob: (payload: {
    name: string
    message: string
    schedule: CronSchedule
    description?: string
    enabled?: boolean
    delete_after_run?: boolean
  }) =>
    request<{ ok: boolean; job: CronJobItem }>('/portal-api/cron/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCronJob: (
    id: string,
    payload: {
      name?: string
      message?: string
      schedule?: CronSchedule
      description?: string
      enabled?: boolean
      delete_after_run?: boolean
    },
  ) =>
    request<{ ok: boolean; job: CronJobItem }>(`/portal-api/cron/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteCronJob: (id: string) =>
    request<{ ok: boolean }>(`/portal-api/cron/jobs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  runCronJob: (id: string) =>
    request<{ ok: boolean; result?: unknown }>(
      `/portal-api/cron/jobs/${encodeURIComponent(id)}/run`,
      { method: 'POST' },
    ),
  getCronRuns: (id: string, limit = 20) =>
    request<{ runs: CronRunEntry[] }>(
      `/portal-api/cron/jobs/${encodeURIComponent(id)}/runs?limit=${limit}`,
    ),
  listReimbursements: () =>
    request<ReimbursementListResponse>('/portal-api/workbench/reimbursements'),
  createReimbursement: (payload: {
    spend_date: string
    title: string
    platform: string
    amount: number
    has_invoice: string
    has_order: string
    has_payment: string
    material_status: string
    claim_status: string
    note: string
    attachment_path?: string
  }) =>
    request<{ ok: boolean; item: ReimbursementItem }>('/portal-api/workbench/reimbursements', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateReimbursement: (
    rowIndex: number,
    payload: Partial<{
      expected_fingerprint: string
      spend_date: string
      title: string
      platform: string
      amount: number
      has_invoice: string
      has_order: string
      has_payment: string
      material_status: string
      claim_status: string
      note: string
      attachment_path: string
    }>,
  ) =>
    request<{ ok: boolean; item: ReimbursementItem }>(
      `/portal-api/workbench/reimbursements/${rowIndex}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    ),
  deleteReimbursement: (rowIndex: number, fingerprint?: string) =>
    request<{ ok: boolean }>(
      `/portal-api/workbench/reimbursements/${rowIndex}${
        fingerprint ? `?fp=${encodeURIComponent(fingerprint)}` : ''
      }`,
      { method: 'DELETE' },
    ),
  exportReimbursementsZip: async (rowIndices: number[]) => {
    const res = await fetch('/portal-api/workbench/reimbursements/export-zip', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row_indices: rowIndices }),
    })
    if (!res.ok) throw new Error(`导出失败 (HTTP ${res.status})`)
    return res.blob()
  },
  getFocus: () => request<FocusState>('/portal-api/workbench/focus'),
  replaceFocus: (payload: { items: Array<Partial<FocusItem> & { title: string }>; external_links?: FocusExternalLink[] }) =>
    request<{ ok: boolean } & FocusState>('/portal-api/workbench/focus', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  addFocusItem: (payload: {
    title: string
    urgency?: FocusUrgency
    tag?: string
    tag_color?: FocusTagColor
    countdown?: string
    progress?: string
    source_url?: string
  }) =>
    request<{ ok: boolean; item: FocusItem; focus: FocusState }>('/portal-api/workbench/focus/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateFocusItem: (
    itemId: string,
    payload: Partial<{
      title: string
      urgency: FocusUrgency
      tag: string
      tag_color: FocusTagColor
      countdown: string
      progress: string
      source_url: string
      done: boolean
    }>,
  ) =>
    request<{ ok: boolean; item: FocusItem; focus: FocusState }>(
      `/portal-api/workbench/focus/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    ),
  deleteFocusItem: (itemId: string) =>
    request<{ ok: boolean; focus: FocusState }>(
      `/portal-api/workbench/focus/items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
    ),
  clearDoneFocus: () =>
    request<{ ok: boolean; focus: FocusState }>('/portal-api/workbench/focus/clear-done', {
      method: 'POST',
    }),
  updateFocusLinks: (external_links: Array<{ id?: string; label: string; url: string }>) =>
    request<{ ok: boolean; focus: FocusState }>('/portal-api/workbench/focus/links', {
      method: 'PUT',
      body: JSON.stringify({ external_links }),
    }),
  listWorkbenchModules: () =>
    request<WorkbenchModulesResponse>('/portal-api/workbench/modules'),
  saveWorkbenchModules: (items: Array<{ id: string; enabled?: boolean }>) =>
    request<WorkbenchModulesResponse>('/portal-api/workbench/modules', {
      method: 'PUT',
      body: JSON.stringify({ items }),
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

export async function attachSessionStream(
  sessionId: string,
  onEvent: (ev: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/portal-api/sessions/${encodeURIComponent(sessionId)}/stream`, {
    method: 'GET',
    credentials: 'same-origin',
    signal,
  })
  if (!res.ok || !res.body) return
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
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw) continue
        try {
          onEvent(JSON.parse(raw) as StreamEvent)
        } catch {
          // ignore
        }
      }
    }
  }
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
