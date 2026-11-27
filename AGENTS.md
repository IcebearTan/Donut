# Donut — Cross-Harness Engineering Constitution (`AGENTS.md`)

> Single source of truth for any AI coding agent / harness (Claude Code, Codex, Cursor, OpenCode, Antigravity, etc.) working on **Donut** (`D:\OpenClaw\portal`). For historical milestones, cloud layout, and pending roadmap items, read `docs/HANDOFF.md`.

## 1. Architecture Overview

- **Backend**: FastAPI + Uvicorn + SQLite (`backend/app/`), Python 3.12.
  - **Strict two-user isolation (`bear`, `her`)**: Every authenticated route MUST use `Depends(get_current_user)` and derive storage paths exclusively from `user["id"]` (`VAULT_DIR / user["id"] / ...`). Never accept `user_id` from request bodies or query strings.
  - **Security layer**:
    - `auth.py` + `db.py`: signed HMAC session cookies with `token_version` & `exp` revocation (`POST /portal-api/auth/logout-all`), 8-char min password length.
    - `rate_limit.py`: in-memory sliding-window rate limiter (`429`) on login & password change.
    - `security_middleware.py`: pure-ASGI CSRF Origin/Referer guard on mutating `/portal-api/*` calls + defensive headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`).
  - **Workbench routers** (`backend/app/workbench_routes.py`, prefix `/portal-api/workbench`):
    - Core: `workbench_focus.py` (Focus), `cron_service.py` (Cron).
    - Plugin registry & micro-app dual engine: `workbench_modules.py`, `workbench_apps.py` (Engine A declarative templates; Engine B sandboxed HTML iframe without `allow-same-origin`).
    - Official built-in plugins:
      - `ledger` (`workbench_ledger.py`, `workbench_ledger_routes.py`, `workbench_ledger_ocr.py`, `workbench_ledger_bill.py`, `workbench_ledger_import.py`): isolated per-user SQLite (`vault/<uid>/workbench/ledger.db`), 0-token Chinese quick parser, memory-only offline `RapidOCR` subprocess (`-I`, `OMP_NUM_THREADS=1`, `asyncio.Semaphore(1)`), WeChat/Alipay CSV/XLSX importer with fingerprint dedup.
      - `reimbursements` (`reimbursement.py`, `reimbursement_routes.py`).
  - **OpenClaw skills & CLI tools** (`openclaw-skills/workbench-builder/`):
    - `tools/focus_sync.py`, `tools/workbench_app.py`, `tools/ledger_summary.py`.
    - All CLI tools MUST resolve `vault` relative to `Path(__file__).resolve().parent.parent / "vault"` first so cron jobs running from arbitrary `cwd` cannot cross user boundaries.

- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS v4 (`frontend/src/`).
  - **API client**: `frontend/src/api/client.ts` (includes FastAPI 422 array `detail` formatting).
  - **URL Hash routing**: `frontend/src/utils/portalRoute.ts` (`#chat`, `#workbench`, `#workbench/<moduleId>`, `#vault`, `#settings/<section>`, `#app/<id>`, plus `LEDGER_UPDATED_EVENT`). Refreshing on any view MUST preserve the active route.
  - **Two-mode Workbench**: `WorkbenchView.tsx` renders `WorkbenchHub.tsx` (Bento overview + tool tile grid) when `activeModule === null`, and `WorkbenchBreadcrumb.tsx` + full-width module when a module is active.
  - **Global 0-token quick ledger**: `QuickLedgerModal.tsx` (triggered via `ChatComposer` Wallet icon or `Alt+L`), supports text multi-item parsing, `Ctrl+V` screenshot offline OCR, and manual entry.
  - **Design tokens & motion**: `frontend/src/styles/themes.css` (`--bg-page`, `--bg-sidebar`, `--bg-surface`, `--bg-elevated`, `--bg-hover`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-subtle`, `--border-strong`, `--accent`, `--accent-contrast`, `--danger`, `--success`). Support BOTH Light and Dark themes via CSS variables; never hardcode raw colors; always respect `prefers-reduced-motion: reduce`.
  - **PWA Service Worker**: `frontend/public/sw.js` (`CACHE_NAME = 'donut-portal-shell-vXX'`). Bump version on user-facing UI releases.

## 2. Mandatory Coding & Design Rules

1. **Modularity & file size limit**: Keep every new or rewritten file concise (**150–260 lines max**). Split complex screens into shell + sub-panels + modals + helper hooks. Make minimal targeted edits on large legacy files (`App.tsx`, `ChatView.tsx`, `main.py`).
2. **Zero Emoji in UI chrome**: Titles, tabs, buttons, badges, cards, modals, and empty states MUST use `lucide-react` vector icons (`frontend/src/components/workbench/iconMap.tsx`). Reserve emojis solely for playful user/assistant avatars or I-land game accents.
3. **Chinese IME safety**: Guard Enter-to-submit inputs with `!(e.nativeEvent.isComposing || e.keyCode === 229)` (reuse `isPlainEnter` / `guardImeEnter`).
4. **Atomic writes**: When writing JSON/CSV files in backend or CLI tools, write `.tmp` then `os.replace()`.
5. **Privacy & zero main-chat pollution**:
   - Workbench plugins MUST NOT write into `chat_sessions` / `chat_messages` or depend on main chat history.
   - Payment screenshot OCR MUST stay strictly in-memory (no `UploadFile` disk spooling, no persisting raw screenshots, no external LLM calls).
6. **Clean checkpoints**: Run build/tests before committing; remove any stray local artifacts (`portal-release.tar.gz`, `backend/.secret`, `backend/vault`, etc.) before `git commit`.

## 3. Cloud Constraints & Pre-ICP Rules (CRITICAL)

- **Host**: `root@43.139.111.113` (2 vCPU / 4 GB RAM; OpenClaw Gateway already uses ~1.9 GB RAM — keep Portal idle RAM lean and never load heavy ML models into the main Uvicorn process).
- **Pre-ICP state**: Domain `icebear-yearning.fun` is awaiting public ICP filing (~mid-December). Users currently access via `http://43.139.111.113:8443`.
  - **DO NOT** default `PORTAL_COOKIE_SECURE` to `1` in code or disable `:8443` until the user explicitly confirms ICP approval and HTTPS cutover.
- **Deployment**: Never run `scripts/publish_cloud.ps1` unless explicitly requested. Never touch or overwrite `/var/lib/couple-space/portal` real user data.

## 4. Verification Commands

> **Git Bash / MSYS path rule**: When invoking `wsl` from Git Bash, ALWAYS prefix with `MSYS_NO_PATHCONV=1` so `/mnt/d/...` and `/home/...` are not rewritten to Windows paths.

- **Backend syntax & unit tests (WSL2 Python 3.12 venv)**:
  ```bash
  MSYS_NO_PATHCONV=1 wsl -d OpenClaw -- /home/openclaw/portal-venv/bin/python3 -m py_compile /mnt/d/OpenClaw/portal/backend/app/*.py
  MSYS_NO_PATHCONV=1 wsl -d OpenClaw -- /home/openclaw/portal-venv/bin/python3 -m unittest discover -s /mnt/d/OpenClaw/portal/backend/tests -v
  ```
- **Frontend typecheck & production build (WSL2 `~/portal-fe-build`)**:
  ```bash
  MSYS_NO_PATHCONV=1 wsl -d OpenClaw -- bash /mnt/d/OpenClaw/portal/scripts/build_portal_bundle.sh
  ```
  *(Delete `D:\OpenClaw\portal-release.tar.gz` afterwards if only verifying build.)*
- **Cloud deploy (only when explicitly requested)**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File D:\OpenClaw\portal\scripts\publish_cloud.ps1
  ```
