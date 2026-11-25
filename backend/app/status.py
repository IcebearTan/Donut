from __future__ import annotations

import asyncio
import datetime
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .config import OPENCLAW_GATEWAY_URL
from .db import db_session
from .persona import get_agent_workspace
from .vault import list_user_skills, list_user_vault_files


def _load_openclaw_meta() -> tuple[str, bool, bool]:
    """Read primary model label, notion MCP presence, and active-memory presence."""
    oc_cfg = Path(os.environ.get("OPENCLAW_HOME", str(Path.home()))) / ".openclaw" / "openclaw.json"
    model_label = "DeepSeek"
    has_notion = False
    has_memory = True
    if not oc_cfg.exists():
        return model_label, has_notion, has_memory
    try:
        raw = oc_cfg.read_text(encoding="utf-8")
        data = json.loads(raw)
        primary = (
            data.get("agents", {})
            .get("defaults", {})
            .get("model", {})
            .get("primary", "")
        )
        if isinstance(primary, str) and primary:
            if "deepseek" in primary.lower():
                model_label = "DeepSeek"
            elif "gemini" in primary.lower():
                model_label = "Gemini"
            elif "claude" in primary.lower():
                model_label = "Claude"
            elif "gpt" in primary.lower() or "openai" in primary.lower():
                model_label = "OpenAI"
            else:
                model_label = primary.split("/")[-1][:18]

        mcp_servers = data.get("mcp", {}).get("servers", {})
        if isinstance(mcp_servers, dict):
            has_notion = any("notion" in k.lower() for k in mcp_servers.keys())
        if not has_notion and "mcp.notion.com" in raw:
            has_notion = True

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
    return model_label, has_notion, has_memory


async def _check_gateway_online() -> bool:
    parsed = urlparse(OPENCLAW_GATEWAY_URL)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        _reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=1.2
        )
        writer.close()
        await writer.wait_closed()
        return True
    except Exception:
        return False


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
    gateway_online = await _check_gateway_online()
    model_label, has_notion, has_memory = _load_openclaw_meta()
    uid = user["id"]
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
    # Only surface Notion badge on bear's workspace (or if notion MCP is configured)
    if has_notion and uid == "bear":
        connections.append({"id": "notion", "label": "Notion 已连接", "online": gateway_online})
    if has_memory:
        connections.append({"id": "memory", "label": "长期记忆 · Wiki", "online": gateway_online})

    skills = list_user_skills(uid)
    vault_map = list_user_vault_files(uid)
    vault_total = sum(len(v) for v in vault_map.values())

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
