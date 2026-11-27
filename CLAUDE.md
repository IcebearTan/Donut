# Donut (`D:\OpenClaw\portal`) — Claude Code Guide

> This file mirrors `AGENTS.md`. Always read **`AGENTS.md`** as the single source of truth for architecture, coding rules, Pre-ICP constraints, and verification commands, and read **`docs/HANDOFF.md`** for current maintenance status and roadmap.

## Quick Reminders for Claude Code
- **Git Bash / MSYS**: Always prefix `wsl` commands with `MSYS_NO_PATHCONV=1`.
- **Modularity**: Keep every new or rewritten file <= 260 lines; zero emojis in UI chrome (`lucide-react` only).
- **Pre-ICP**: Keep `PORTAL_COOKIE_SECURE` default `0` until ICP filing for `icebear-yearning.fun` clears.
- **Verification**:
  - Backend: `MSYS_NO_PATHCONV=1 wsl -d OpenClaw -- /home/openclaw/portal-venv/bin/python3 -m unittest discover -s /mnt/d/OpenClaw/portal/backend/tests -v`
  - Frontend: `MSYS_NO_PATHCONV=1 wsl -d OpenClaw -- bash /mnt/d/OpenClaw/portal/scripts/build_portal_bundle.sh`
- **Deploy**: Do NOT run `scripts/publish_cloud.ps1` or `git commit` unless explicitly instructed by the prompt.
