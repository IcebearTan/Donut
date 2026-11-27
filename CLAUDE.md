# Donut Portal (`D:\OpenClaw\portal`) — Project Constitution

## 1. Architecture Overview
- **Backend**: FastAPI + Uvicorn + SQLite (`backend/app/`), Python 3.12.
  - Strict two-user isolation (`bear` and `her`). Every authenticated route MUST use `Depends(get_current_user)` and derive data paths exclusively from `user["id"]` (`VAULT_DIR / user["id"] / ...`). Never accept `user_id` from request payloads.
  - Workbench routers live in `backend/app/workbench_routes.py` (prefix `/portal-api/workbench`), with modular service files (`workbench_focus.py`, `workbench_modules.py`, `workbench_apps.py`, `reimbursement.py`, `reimbursement_routes.py`).
- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS v4 (`frontend/src/`).
  - API types and client live in `frontend/src/api/client.ts`.
  - Design tokens live in `frontend/src/styles/themes.css` (`--bg-page`, `--bg-sidebar`, `--bg-surface`, `--bg-elevated`, `--bg-hover`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-subtle`, `--border-strong`, `--accent`, `--accent-contrast`, `--danger`, `--success`). Support BOTH Light and Dark themes seamlessly via these CSS variables; never hardcode white/black backgrounds.
  - PWA service worker cache version is in `frontend/public/sw.js` (`CACHE_NAME = 'donut-portal-shell-vXX'`). Bump version on UI releases.

## 2. Coding & Modularity Rules (Mandatory)
- **File size limit**: Keep every new or rewritten file concise and modular (**150–280 lines max**). Split complex views into shell + sub-panels + modals + helper modules.
- **Icons & UI aesthetic**: **Zero Emoji** in new UI chrome (titles, tabs, buttons, badges, cards, empty states). Use crisp, consistent `lucide-react` vector icons (`frontend/src/components/workbench/iconMap.tsx`).
- **Chinese IME safety**: On Enter-to-submit text inputs, guard with `!(e.nativeEvent.isComposing || e.keyCode === 229)`.
- **Atomic writes**: When writing JSON/CSV files, always write `.tmp` then `os.replace()`.
- **No main-chat pollution**: Workbench plugins MUST NOT write into `chat_sessions` / `chat_messages` or depend on main chat history.

## 3. Cloud Deployment & Pre-ICP Constraints
- Cloud host: `root@43.139.111.113` (2 vCPU / 4 GB RAM; OpenClaw Node already uses ~1.9 GB RAM — keep backend memory lean!).
- **IMPORTANT (Pre-ICP)**: Domain `icebear-yearning.fun` is awaiting ICP filing; users currently access via `http://43.139.111.113:8443`. Do **NOT** default `PORTAL_COOKIE_SECURE` to `1` in code (keep env-driven default `0` so `:8443` login continues working until ICP clears).
- Do NOT run cloud deployment (`publish_cloud.ps1`) unless explicitly instructed; leave git working tree clean or ready for review.

## 4. Verification Commands
- Frontend build check (run inside WSL2 where `node_modules` lives, or `pnpm` if installed):
  `wsl -d OpenClaw -- bash /mnt/d/OpenClaw/portal/scripts/build_portal_bundle.sh`
  (delete `/mnt/d/OpenClaw/portal-release.tar.gz` afterwards if just testing build).
- Backend syntax & tests (WSL2 Python 3.12):
  `wsl -d OpenClaw -- python3 -m py_compile /mnt/d/OpenClaw/portal/backend/app/*.py`
  `wsl -d OpenClaw -- python3 -m unittest discover -s /mnt/d/OpenClaw/portal/backend/tests -v`
