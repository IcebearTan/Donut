from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from .db import db_session, now_ms
from .openclaw_client import stream_openclaw_response
from .titler import generate_smart_title


@dataclass
class ActiveRun:
    session_id: str
    user_id: str
    user_message_id: str
    assistant_message_id: str
    title: str
    started_at_ms: int
    started_mono: float
    content_parts: list[str] = field(default_factory=list)
    thinking_parts: list[str] = field(default_factory=list)
    tools_map: dict[str, dict[str, str]] = field(default_factory=dict)
    usage: dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    finished: bool = False
    subscribers: list[asyncio.Queue[Optional[dict[str, Any]]]] = field(default_factory=list)
    task: Optional[asyncio.Task[None]] = None

    def snapshot(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "user_message_id": self.user_message_id,
            "assistant_message_id": self.assistant_message_id,
            "title": self.title,
            "started_at": self.started_at_ms,
            "content": "".join(self.content_parts),
            "thinking": "".join(self.thinking_parts),
            "tools": list(self.tools_map.values()),
            "finished": self.finished,
            "error": self.error,
        }

    def broadcast(self, ev: Optional[dict[str, Any]]) -> None:
        for q in list(self.subscribers):
            try:
                q.put_nowait(ev)
            except Exception:
                pass


# Active detached runs keyed by session_id so browser refresh/navigation never drops a running task
_ACTIVE_RUNS: dict[str, ActiveRun] = {}


def get_active_run(session_id: str, user_id: str) -> Optional[ActiveRun]:
    run = _ACTIVE_RUNS.get(session_id)
    if run and run.user_id == user_id and not run.finished:
        return run
    return None


def cancel_active_run(session_id: str, user_id: str) -> bool:
    run = _ACTIVE_RUNS.get(session_id)
    if not run or run.user_id != user_id or run.finished:
        return False
    if run.task and not run.task.done():
        run.task.cancel()
        return True
    return False


def start_detached_run(
    *,
    session_id: str,
    user_id: str,
    user_message_id: str,
    assistant_message_id: str,
    initial_title: str,
    openclaw_text: str,
    image_paths: list[Path],
    instructions: Optional[str],
    should_auto_title: bool,
    auto_title_seed: str,
) -> ActiveRun:
    # Cancel any stale finished entry
    prev = _ACTIVE_RUNS.get(session_id)
    if prev and prev.task and not prev.task.done():
        prev.task.cancel()

    run = ActiveRun(
        session_id=session_id,
        user_id=user_id,
        user_message_id=user_message_id,
        assistant_message_id=assistant_message_id,
        title=initial_title,
        started_at_ms=now_ms(),
        started_mono=time.monotonic(),
    )
    _ACTIVE_RUNS[session_id] = run

    async def _worker() -> None:
        cancelled = False
        try:
            async for ev in stream_openclaw_response(
                user_id=user_id,
                session_id=session_id,
                text=openclaw_text,
                image_paths=image_paths,
                instructions=instructions,
            ):
                ev_type = ev.get("type")
                if ev_type == "delta":
                    run.content_parts.append(str(ev.get("text") or ""))
                elif ev_type == "thinking":
                    run.thinking_parts.append(str(ev.get("delta") or ""))
                elif ev_type == "tool":
                    tid = str(ev.get("id") or ev.get("name"))
                    run.tools_map[tid] = {
                        "id": tid,
                        "name": str(ev.get("name") or "tool"),
                        "status": str(ev.get("status") or "running"),
                    }
                elif ev_type == "done":
                    usage_obj = ev.get("usage") or {}
                    usage_obj["elapsed_ms"] = int((time.monotonic() - run.started_mono) * 1000)
                    run.usage = usage_obj
                    ev = {**ev, "usage": usage_obj}
                elif ev_type == "error":
                    run.error = str(ev.get("message") or "OpenClaw error")
                run.broadcast(ev)
        except asyncio.CancelledError:
            cancelled = True
        except Exception as exc:
            run.error = f"后台任务中断: {exc}"
            run.broadcast({"type": "error", "message": run.error})
        finally:
            final_content = "".join(run.content_parts)
            final_thinking = "".join(run.thinking_parts)
            final_tools = list(run.tools_map.values())
            if not run.usage:
                run.usage = {"elapsed_ms": int((time.monotonic() - run.started_mono) * 1000)}

            # Always persist assistant output to SQLite even if browser refreshed/disconnected!
            if final_content or final_thinking or final_tools:
                try:
                    with db_session() as conn:
                        conn.execute(
                            """
                            INSERT OR REPLACE INTO chat_messages
                              (id, session_id, role, content, thinking, tools_json, usage_json, created_at)
                            VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
                            """,
                            (
                                assistant_message_id,
                                session_id,
                                final_content,
                                final_thinking,
                                json.dumps(final_tools, ensure_ascii=False),
                                json.dumps(run.usage, ensure_ascii=False),
                                now_ms(),
                            ),
                        )
                        conn.execute(
                            "UPDATE chat_sessions SET updated_at = ? WHERE id = ?",
                            (now_ms(), session_id),
                        )
                except Exception:
                    pass

            if not cancelled and should_auto_title and final_content:
                try:
                    smart_title = await generate_smart_title(auto_title_seed, final_content)
                    if smart_title and smart_title != run.title:
                        run.title = smart_title
                        with db_session() as conn:
                            conn.execute(
                                "UPDATE chat_sessions SET title = ? WHERE id = ? AND user_id = ?",
                                (smart_title, session_id, user_id),
                            )
                        run.broadcast({"type": "title", "title": smart_title})
                except Exception:
                    pass

            run.finished = True
            run.broadcast(None)
            # Clean up registry shortly after completion
            if _ACTIVE_RUNS.get(session_id) is run:
                _ACTIVE_RUNS.pop(session_id, None)

    run.task = asyncio.create_task(_worker())
    return run
