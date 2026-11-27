from __future__ import annotations

import asyncio
import datetime
import fnmatch
import json
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .config import OPENCLAW_GATEWAY_URL, USER_AGENT_MAP
from .db import db_session
from .persona import get_agent_workspace
from .vault import list_user_skills, list_user_vault_files

META_TTL_SEC = 15.0
GATEWAY_TTL_SEC = 15.0

_META_CACHE: dict[str, tuple[float, tuple[str, bool, bool]]] = {}
_GATEWAY_CACHE: tuple[float, bool] | None = None


def clear_status_caches() -> None:
    """Clear in-memory status TTL caches (primarily for tests)."""
    global _GATEWAY_CACHE
    _META_CACHE.clear()
    _GATEWAY_CACHE = None


def _format_model_label(model_spec: str) -> str:
    low = model_spec.lower()
    if "deepseek" in low:
        return "DeepSeek"
    if "gemini" in low:
        return "Gemini"
    if "claude" in low:
        return "Claude"
    if "gpt" in low or "openai" in low:
        return "OpenAI"
    return model_spec.split("/")[-1][:18] or "DeepSeek"


def _agent_allows_notion(data: dict[str, Any], agent_id: str) -> bool:
    mcp_servers = data.get("mcp", {}).get("servers", {})
    if not isinstance(mcp_servers, dict):
        return False
    notion_entries = [
        cfg for name, cfg in mcp_servers.items() if "notion" in str(name).lower()
    ]
    if not notion_entries:
        return False

    allowed_by_server = False
    for cfg in notion_entries:
        if isinstance(cfg, dict):
            scoped = cfg.get("agents")
            if isinstance(scoped, list) and scoped:
                if agent_id in scoped:
                    allowed_by_server = True
            else:
                allowed_by_server = True
        else:
            allowed_by_server = True
    if not allowed_by_server:
        return False

    agent_cfg = data.get("agents", {}).get("entries", {}).get(agent_id, {})
    if isinstance(agent_cfg, dict):
        deny = agent_cfg.get("tools", {}).get("deny", [])
        if isinstance(deny, list):
            for pat in deny:
                p = str(pat).strip().lower()
                if not p:
                    continue
                if (
                    fnmatch.fnmatch("notion-search", p)
                    or fnmatch.fnmatch("mcp:notion", p)
                    or "notion" in p
                ):
                    return False
    return True


def _load_openclaw_meta(agent_id: str = "main") -> tuple[str, bool, bool]:
    """Read per-agent model label, Notion MCP access, and memory status with 15s TTL cache."""
    now = time.monotonic()
    cached = _META_CACHE.get(agent_id)
    if cached and (now - cached[0]) < META_TTL_SEC:
        return cached[1]

    oc_cfg = Path(os.environ.get("OPENCLAW_HOME", str(Path.home()))) / ".openclaw" / "openclaw.json"
    model_label = "DeepSeek"
    has_notion = False
    has_memory = True
    if not oc_cfg.exists():
        result = (model_label, has_notion, has_memory)
        _META_CACHE[agent_id] = (now, result)
        return result
    try:
        raw = oc_cfg.read_text(encoding="utf-8")
        data = json.loads(raw)
        agent_entry = data.get("agents", {}).get("entries", {}).get(agent_id, {})
        agent_model = agent_entry.get("model") if isinstance(agent_entry, dict) else ""
        if isinstance(agent_model, dict):
            agent_model = agent_model.get("primary", "")
        primary = (
            agent_model
            if isinstance(agent_model, str) and agent_model.strip()
            else data.get("agents", {}).get("defaults", {}).get("model", {}).get("primary", "")
        )
        if isinstance(primary, str) and primary.strip():
            model_label = _format_model_label(primary.strip())

        has_notion = _agent_allows_notion(data, agent_id)

        plugins = data.get("plugins", {}).get("entries", {})
        if isinstance(plugins, dict):
            has_active = (
                bool(plugins["active-memory"].get("enabled", True))
                if "active-memory" in plugins
                else True
            )
            has_wiki = (
                bool(plugins["memory-wiki"].get("enabled", False))
                if "memory-wiki" in plugins
                else False
            )
            has_memory = has_active or has_wiki
    except Exception:
        pass
    result = (model_label, has_notion, has_memory)
    _META_CACHE[agent_id] = (now, result)
    return result


async def _check_gateway_online() -> bool:
    global _GATEWAY_CACHE
    now = time.monotonic()
    if _GATEWAY_CACHE and (now - _GATEWAY_CACHE[0]) < GATEWAY_TTL_SEC:
        return _GATEWAY_CACHE[1]

    parsed = urlparse(OPENCLAW_GATEWAY_URL)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    online = False
    try:
        _reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=1.2
        )
        writer.close()
        await writer.wait_closed()
        online = True
    except Exception:
        online = False
    _GATEWAY_CACHE = (now, online)
    return online


def _friendly_tool_activity(name: str) -> str:
    low = name.lower()
    if "notion" in low:
        return "查阅了 Notion"
    if "memory" in low or "wiki" in low:
        return "翻阅了长期记忆"
    if "search" in low or "web" in low or "fetch" in low:
        return "进行了联网检索"
    if "read" in low or "write" in low or "file" in low:
        return "整理了工作区笔记"
    return f"调用了 {name}"


def _today_start_ms() -> int:
    # UTC+8 local day boundary for clean Chinese daily counts
    tz = datetime.timezone(datetime.timedelta(hours=8))
    now = datetime.datetime.now(tz)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(start.timestamp() * 1000)


async def get_companion_status(user: dict[str, Any]) -> dict[str, Any]:
    uid = user["id"]
    agent_id = USER_AGENT_MAP.get(uid, "main")
    gateway_online = await _check_gateway_online()
    model_label, has_notion, has_memory = _load_openclaw_meta(agent_id)
    today_ms = _today_start_ms()

    activities: list[dict[str, Any]] = []
    today_turns = 0
    total_sessions = 0
    last_active_at: int | None = None

    with db_session() as conn:
        row_sess = conn.execute(
            "SELECT COUNT(*) AS cnt FROM chat_sessions WHERE user_id = ?", (uid,)
        ).fetchone()
        total_sessions = int(row_sess["cnt"]) if row_sess else 0

        row_today = conn.execute(
            """
            SELECT COUNT(*) AS cnt
            FROM chat_messages m
            JOIN chat_sessions s ON s.id = m.session_id
            WHERE s.user_id = ? AND m.role = 'user' AND m.created_at >= ?
            """,
            (uid, today_ms),
        ).fetchone()
        today_turns = int(row_today["cnt"]) if row_today else 0

        row_last = conn.execute(
            """
            SELECT MAX(m.created_at) AS last_at
            FROM chat_messages m
            JOIN chat_sessions s ON s.id = m.session_id
            WHERE s.user_id = ?
            """,
            (uid,),
        ).fetchone()
        if row_last and row_last["last_at"]:
            last_active_at = int(row_last["last_at"])

        # Recent assistant tool activities strictly for this user
        tool_rows = conn.execute(
            """
            SELECT m.id, m.tools_json, m.created_at
            FROM chat_messages m
            JOIN chat_sessions s ON s.id = m.session_id
            WHERE s.user_id = ? AND m.role = 'assistant'
              AND m.tools_json IS NOT NULL AND m.tools_json != '[]' AND m.tools_json != ''
            ORDER BY m.created_at DESC
            LIMIT 8
            """,
            (uid,),
        ).fetchall()

        for r in tool_rows:
            try:
                tools = json.loads(r["tools_json"] or "[]")
            except Exception:
                tools = []
            seen_labels: set[str] = set()
            for t in tools:
                label = _friendly_tool_activity(str(t.get("name") or "tool"))
                if label in seen_labels:
                    continue
                seen_labels.add(label)
                activities.append(
                    {
                        "id": f"tool-{r['id']}-{len(seen_labels)}",
                        "kind": "tool",
                        "text": label,
                        "at": int(r["created_at"]),
                    }
                )

        # Recent session topics
        sess_rows = conn.execute(
            """
            SELECT id, title, updated_at
            FROM chat_sessions
            WHERE user_id = ? AND title != '新对话' AND is_main = 0
            ORDER BY updated_at DESC
            LIMIT 4
            """,
            (uid,),
        ).fetchall()
        for r in sess_rows:
            title = str(r["title"]).strip()
            if len(title) > 16:
                title = title[:16] + "…"
            activities.append(
                {
                    "id": f"sess-{r['id']}",
                    "kind": "chat",
                    "text": f"聊了「{title}」",
                    "at": int(r["updated_at"]),
                }
            )

        proj_rows = conn.execute(
            """
            SELECT id, slug, name, emoji, summary, updated_at
            FROM projects
            WHERE user_id = ?
            ORDER BY updated_at DESC
            LIMIT 8
            """,
            (uid,),
        ).fetchall()
        projects_summary = [dict(r) for r in proj_rows]

    # Check project MEMORY.md mtimes for recent project updates
    try:
        ws = get_agent_workspace(uid)
        for p in projects_summary[:5]:
            mem_file = ws / "projects" / p["slug"] / "MEMORY.md"
            if mem_file.exists():
                mtime_ms = int(mem_file.stat().st_mtime * 1000)
                activities.append(
                    {
                        "id": f"proj-mem-{p['id']}-{mtime_ms}",
                        "kind": "project",
                        "text": f"更新了「{p['name']}」项目记忆",
                        "at": mtime_ms,
                    }
                )
        soul_file = ws / "SOUL.md"
        if soul_file.exists():
            mtime_ms = int(soul_file.stat().st_mtime * 1000)
            activities.append(
                {
                    "id": f"persona-{mtime_ms}",
                    "kind": "persona",
                    "text": "同步了专属助手人设",
                    "at": mtime_ms,
                }
            )
    except Exception:
        pass

    activities.sort(key=lambda x: x["at"], reverse=True)
    activities = activities[:6]

    connections = [
        {"id": "engine", "label": f"OpenClaw · {model_label}", "online": gateway_online},
    ]
    if has_notion:
        connections.append({"id": "notion", "label": "Notion 已连接", "online": gateway_online})
    if has_memory:
        connections.append({"id": "memory", "label": "长期记忆 · Wiki", "online": gateway_online})

    skills = list_user_skills(uid)
    vault_map = list_user_vault_files(uid)
    vault_total = (
        len(vault_map.get("inbox", []))
        + len(vault_map.get("artifacts", []))
        + len(vault_map.get("archive", []))
    )

    return {
        "gateway_online": gateway_online,
        "model_label": model_label,
        "connections": connections,
        "stats": {
            "today_turns": today_turns,
            "total_sessions": total_sessions,
            "last_active_at": last_active_at,
            "projects_count": len(projects_summary),
            "skills_count": len(skills),
            "vault_files_count": vault_total,
        },
        "skills": skills[:12],
        "activities": activities,
    }
