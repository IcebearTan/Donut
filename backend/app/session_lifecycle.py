from __future__ import annotations

import datetime
import os
import shutil
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .config import USER_AGENT_MAP
from .db import db_session, now_ms
from .openclaw_client import run_openclaw_once
from .persona import get_agent_workspace
from .projects import append_project_memory
from .runs import get_active_run


def build_session_key_suffix(session_id: str, context_gen: int = 1) -> str:
    """Gen 1 keeps legacy `portal-{id}` for 100% compatibility; gen >= 2 rolls over."""
    gen = max(1, int(context_gen or 1))
    return f"portal-{session_id}" if gen <= 1 else f"portal-{session_id}-g{gen}"


def _resolve_openclaw_bin() -> str | None:
    env_bin = os.environ.get("OPENCLAW_BIN", "").strip()
    if env_bin and Path(env_bin).is_file():
        return env_bin
    found = shutil.which("openclaw")
    if found:
        return found
    fallback = Path.home() / ".npm-global" / "bin" / "openclaw"
    return str(fallback) if fallback.is_file() else None


def _delete_keys_bg(agent_id: str, keys: list[str]) -> None:
    bin_path = _resolve_openclaw_bin()
    if not bin_path or not keys:
        return

    def _run() -> None:
        try:
            subprocess.run(
                [bin_path, "sessions", "delete", *keys, "--agent", agent_id, "--yes"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=25,
                check=False,
            )
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True, name="openclaw-session-cleanup").start()


def schedule_delete_openclaw_sessions(
    user_id: str,
    session_id: str,
    max_gen: int = 1,
    extra_suffixes: list[str] | None = None,
) -> None:
    """Best-effort async cleanup of OpenClaw session transcripts across generations."""
    agent_id = USER_AGENT_MAP.get(user_id)
    if not agent_id:
        return
    keys = [
        f"agent:{agent_id}:{build_session_key_suffix(session_id, g)}"
        for g in range(1, max(1, int(max_gen or 1)) + 1)
    ]
    for suf in extra_suffixes or []:
        if suf:
            keys.append(f"agent:{agent_id}:{suf}")
    _delete_keys_bg(agent_id, keys)


def append_workspace_memory(user_id: str, session_title: str, note_md: str) -> str:
    """Append a dated compaction note to the user's isolated workspace MEMORY.md."""
    mem_path = get_agent_workspace(user_id) / "MEMORY.md"
    existing = mem_path.read_text(encoding="utf-8").rstrip() if mem_path.exists() else ""
    tz = datetime.timezone(datetime.timedelta(hours=8))
    stamp = datetime.datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    safe_title = (session_title or "主对话").strip()[:40]
    block = f"\n\n## {stamp} 对话翻篇沉淀（{safe_title}）\n\n{note_md.strip()}\n"
    updated = (existing + block).lstrip()
    mem_path.write_text(updated, encoding="utf-8")
    return updated


def consume_carryover_context(user_id: str, session_id: str) -> str:
    """Pop one-shot carryover summary for the first turn after compaction."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT carryover_summary FROM chat_sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        ).fetchone()
        summary = str(row["carryover_summary"] or "").strip() if row else ""
        if not summary:
            return ""
        conn.execute(
            "UPDATE chat_sessions SET carryover_summary = '' WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        )
    return (
        "\n\n[上一段对话已完成记忆沉淀并翻篇，以下是延续的关键背景（已同步写入长期记忆，无需重复寒暄）]\n"
        f"{summary}"
    )


async def compact_session_context(user_id: str, session_id: str) -> dict[str, Any]:
    """Distill recent conversation into MEMORY.md, bump context_gen, and prune old OpenClaw key."""
    if get_active_run(session_id, user_id) is not None:
        raise HTTPException(status_code=409, detail="当前对话正在回复中，请稍后再翻篇")

    with db_session() as conn:
        sess_row = conn.execute(
            "SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        ).fetchone()
        if not sess_row:
            raise HTTPException(status_code=404, detail="会话不存在或无权访问")
        sess = dict(sess_row)
        compacted_at = int(sess.get("compacted_at") or 0)
        rows = conn.execute(
            """
            SELECT role, content
            FROM chat_messages
            WHERE session_id = ? AND created_at > ?
            ORDER BY created_at DESC
            LIMIT 24
            """,
            (session_id, compacted_at),
        ).fetchall()
        proj_row = None
        if sess.get("project_id"):
            proj_row = conn.execute(
                "SELECT id, slug, name FROM projects WHERE id = ? AND user_id = ?",
                (sess["project_id"], user_id),
            ).fetchone()

    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="当前对话暂无足够的新内容可供沉淀翻篇")

    lines = []
    for r in reversed(rows):
        role_label = "用户" if r["role"] == "user" else "助手"
        text = str(r["content"] or "").strip()
        if text:
            lines.append(f"{role_label}：{text[:800]}")
    transcript = "\n\n".join(lines)
    if not transcript:
        raise HTTPException(status_code=400, detail="当前对话没有可沉淀的文本内容")

    ephemeral_suffix = f"compact-{session_id}-{uuid.uuid4().hex[:6]}"
    prompt = (
        f"请将下面这段围绕「{sess['title']}」的近期对话提炼为 3~6 条高密度中文 Markdown 要点，"
        "用于写入长期记忆并作为下一段新上下文的轻量化交接摘要：\n"
        "- 仅保留：已确定的事实与偏好、阶段性结论、重要数字/日期、以及未完待续的事项。\n"
        "- 去除寒暄、过程性尝试和冗余细节，总字数控制在 350 字以内。\n\n"
        f"--- 近期对话 ---\n{transcript}"
    )
    try:
        summary_md = await run_openclaw_once(
            user_id=user_id,
            session_key_suffix=ephemeral_suffix,
            prompt=prompt,
            instructions="你是严谨的记忆整理助手，只输出精炼的中文 Markdown 列表，不要任何开场白或结束语。",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"记忆沉淀失败: {exc}")

    if not summary_md:
        raise HTTPException(status_code=502, detail="未能提炼出有效记忆内容")

    if proj_row:
        append_project_memory(user_id, proj_row["slug"], summary_md)
        memory_target = f"projects/{proj_row['slug']}/MEMORY.md"
    else:
        append_workspace_memory(user_id, sess["title"], summary_md)
        memory_target = "MEMORY.md"

    old_gen = max(1, int(sess.get("context_gen") or 1))
    new_gen = old_gen + 1
    ts = now_ms()
    with db_session() as conn:
        conn.execute(
            """
            UPDATE chat_sessions
            SET context_gen = ?, carryover_summary = ?, compacted_at = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (new_gen, summary_md, ts, ts, session_id, user_id),
        )

    schedule_delete_openclaw_sessions(
        user_id, session_id, max_gen=old_gen, extra_suffixes=[ephemeral_suffix]
    )
    return {
        "ok": True,
        "session_id": session_id,
        "context_gen": new_gen,
        "compacted_at": ts,
        "summary": summary_md,
        "memory_target": memory_target,
    }
