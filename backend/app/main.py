from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import time
import uuid
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

from .auth import (
    clear_auth_cookie,
    get_current_user,
    hash_password,
    seed_users,
    set_auth_cookie,
    verify_password,
)
from .config import (
    FRONTEND_DIST,
    ILAND_URL,
    SSO_SECRET,
    UPLOAD_DIR,
    USER_AGENT_MAP,
    get_registered_apps,
)
from .db import db_session, init_db, now_ms
from .openclaw_client import stream_openclaw_response
from .persona import PERSONA_PRESETS, read_persona_files, write_persona_files
from .status import get_companion_status


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    seed_users()
    yield


app = FastAPI(title="Couple Space Portal", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Auth & Identity
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=128)


class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=24)
    assistant_name: Optional[str] = Field(default=None, min_length=1, max_length=24)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=4, max_length=128)


@app.get("/portal-api/auth/users")
def list_login_hints() -> dict:
    """Public login quick-pick cards (display name & emoji only, no secrets)."""
    with db_session() as conn:
        rows = conn.execute(
            "SELECT id, display_name, avatar_emoji FROM users ORDER BY created_at ASC"
        ).fetchall()
    return {"users": [dict(r) for r in rows]}


@app.post("/portal-api/auth/login")
def login(body: LoginRequest, response: Response) -> dict:
    name = body.name.strip()
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE display_name = ? OR id = ?",
            (name, name),
        ).fetchone()
    if not row or not verify_password(body.password, row["pass_hash"]):
        raise HTTPException(status_code=401, detail="账号名或暗号不正确")
    set_auth_cookie(response, row["id"])
    return {
        "user": {
            "id": row["id"],
            "display_name": row["display_name"],
            "avatar_emoji": row["avatar_emoji"],
            "assistant_name": row["assistant_name"],
            "assistant_emoji": row["assistant_emoji"],
        }
    }


@app.post("/portal-api/auth/logout")
def logout(response: Response) -> dict:
    clear_auth_cookie(response)
    return {"ok": True}


@app.get("/portal-api/auth/me")
def me(user: dict = Depends(get_current_user)) -> dict:
    return {
        "user": user,
        "agent_id": USER_AGENT_MAP.get(user["id"], "main"),
        "apps": get_registered_apps(user["id"]),
    }


@app.patch("/portal-api/auth/profile")
def update_profile(
    body: ProfileUpdateRequest, user: dict = Depends(get_current_user)
) -> dict:
    new_display = body.display_name.strip() if body.display_name else user["display_name"]
    new_assistant = (
        body.assistant_name.strip() if body.assistant_name else user["assistant_name"]
    )
    with db_session() as conn:
        conflict = conn.execute(
            "SELECT id FROM users WHERE display_name = ? AND id != ?",
            (new_display, user["id"]),
        ).fetchone()
        if conflict:
            raise HTTPException(status_code=409, detail="这个称呼已经被另一位占用了")
        conn.execute(
            "UPDATE users SET display_name = ?, assistant_name = ? WHERE id = ?",
            (new_display, new_assistant, user["id"]),
        )
    return {
        "user": {
            **user,
            "display_name": new_display,
            "assistant_name": new_assistant,
        }
    }


@app.post("/portal-api/auth/password")
def change_password(
    body: PasswordChangeRequest, user: dict = Depends(get_current_user)
) -> dict:
    with db_session() as conn:
        row = conn.execute(
            "SELECT pass_hash FROM users WHERE id = ?", (user["id"],)
        ).fetchone()
        if not row or not verify_password(body.current_password, row["pass_hash"]):
            raise HTTPException(status_code=400, detail="当前暗号不正确")
        conn.execute(
            "UPDATE users SET pass_hash = ? WHERE id = ?",
            (hash_password(body.new_password), user["id"]),
        )
    return {"ok": True}


class PersonaUpdateRequest(BaseModel):
    assistant_name: str = Field(min_length=1, max_length=24)
    assistant_emoji: str = Field(default="🍩", min_length=1, max_length=8)
    soul_md: str = Field(default="", max_length=8000)
    user_md: str = Field(default="", max_length=4000)


@app.get("/portal-api/persona")
def get_persona(user: dict = Depends(get_current_user)) -> dict:
    files = read_persona_files(user["id"])
    return {
        "assistant_name": user["assistant_name"],
        "assistant_emoji": user.get("assistant_emoji") or "🍩",
        "soul_md": files["soul_md"],
        "user_md": files["user_md"],
        "presets": PERSONA_PRESETS,
    }


@app.put("/portal-api/persona")
def save_persona(
    body: PersonaUpdateRequest, user: dict = Depends(get_current_user)
) -> dict:
    name = body.assistant_name.strip() or "Donut"
    emoji = body.assistant_emoji.strip() or "🍩"
    with db_session() as conn:
        conn.execute(
            "UPDATE users SET assistant_name = ?, assistant_emoji = ? WHERE id = ?",
            (name, emoji, user["id"]),
        )
    write_persona_files(user["id"], body.soul_md, body.user_md)
    return {
        "user": {
            **user,
            "assistant_name": name,
            "assistant_emoji": emoji,
        },
        "soul_md": body.soul_md.strip(),
        "user_md": body.user_md.strip(),
    }


# ---------------------------------------------------------------------------
# Apps Registry
# ---------------------------------------------------------------------------


@app.get("/portal-api/apps")
def list_apps(user: dict = Depends(get_current_user)) -> dict:
    return {"apps": get_registered_apps(user["id"])}


@app.get("/portal-api/apps/{app_id}/launch")
def launch_app(app_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Issue a short-lived signed SSO URL for registered sub-apps (e.g. I-land)."""
    apps = {a["id"]: a for a in get_registered_apps(user["id"])}
    target = apps.get(app_id)
    if not target:
        raise HTTPException(status_code=404, detail="应用不存在")
    if app_id == "iland" and SSO_SECRET:
        payload = json.dumps(
            {"account": user["id"], "ts": int(time.time())}, separators=(",", ":")
        ).encode("utf-8")
        b64 = base64.urlsafe_b64encode(payload).decode("ascii")
        sig = hmac.new(
            SSO_SECRET.encode("utf-8"), b64.encode("ascii"), hashlib.sha256
        ).hexdigest()
        base = ILAND_URL.rstrip("/")
        next_path = f"{base}/" if base.startswith("/") else "/"
        return {"url": f"{base}/api/auth/sso?token={b64}.{sig}&next={next_path}"}
    return {"url": target["path"]}


# ---------------------------------------------------------------------------
# Isolated Chat Sessions (Strictly scoped to current user!)
# ---------------------------------------------------------------------------


class CreateSessionRequest(BaseModel):
    title: str = Field(default="新对话", max_length=80)


class RenameSessionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)


def _require_owned_session(conn: Any, session_id: str, user_id: str) -> dict:
    row = conn.execute(
        "SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="会话不存在或无权访问")
    return dict(row)


@app.get("/portal-api/sessions")
def list_sessions(user: dict = Depends(get_current_user)) -> dict:
    with db_session() as conn:
        rows = conn.execute(
            """
            SELECT id, title, space_type, created_at, updated_at
            FROM chat_sessions
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user["id"],),
        ).fetchall()
    return {"sessions": [dict(r) for r in rows]}


@app.post("/portal-api/sessions")
def create_session(
    body: CreateSessionRequest, user: dict = Depends(get_current_user)
) -> dict:
    sid = uuid.uuid4().hex[:12]
    ts = now_ms()
    title = body.title.strip() or "新对话"
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO chat_sessions (id, user_id, space_type, title, created_at, updated_at)
            VALUES (?, ?, 'personal', ?, ?, ?)
            """,
            (sid, user["id"], title, ts, ts),
        )
    return {
        "session": {
            "id": sid,
            "title": title,
            "space_type": "personal",
            "created_at": ts,
            "updated_at": ts,
        }
    }


@app.patch("/portal-api/sessions/{session_id}")
def rename_session(
    session_id: str,
    body: RenameSessionRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    title = body.title.strip()
    with db_session() as conn:
        _require_owned_session(conn, session_id, user["id"])
        conn.execute(
            "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (title, now_ms(), session_id, user["id"]),
        )
    return {"ok": True, "title": title}


@app.delete("/portal-api/sessions/{session_id}")
def delete_session(session_id: str, user: dict = Depends(get_current_user)) -> dict:
    with db_session() as conn:
        _require_owned_session(conn, session_id, user["id"])
        conn.execute(
            "DELETE FROM chat_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        )
    return {"ok": True}


@app.get("/portal-api/sessions/{session_id}/messages")
def get_messages(session_id: str, user: dict = Depends(get_current_user)) -> dict:
    with db_session() as conn:
        _require_owned_session(conn, session_id, user["id"])
        rows = conn.execute(
            """
            SELECT id, role, content, thinking, tools_json, images_json, usage_json, created_at
            FROM chat_messages
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (session_id,),
        ).fetchall()
    messages = []
    for r in rows:
        messages.append(
            {
                "id": r["id"],
                "role": r["role"],
                "content": r["content"],
                "thinking": r["thinking"],
                "tools": json.loads(r["tools_json"] or "[]"),
                "images": json.loads(r["images_json"] or "[]"),
                "usage": json.loads(r["usage_json"] or "{}"),
                "created_at": r["created_at"],
            }
        )
    return {"messages": messages}


# ---------------------------------------------------------------------------
# User-scoped Image Uploads (for DeepSeek / Gemini Vision)
# ---------------------------------------------------------------------------


@app.post("/portal-api/uploads")
async def upload_image(
    file: UploadFile = File(...), user: dict = Depends(get_current_user)
) -> dict:
    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="图片不能超过 15MB")
    try:
        img = Image.open(BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        # Resize very large phone photos to max 1600px on longest side for fast vision API
        img.thumbnail((1600, 1600))
    except Exception:
        raise HTTPException(status_code=400, detail="不支持的图片格式")

    user_dir = UPLOAD_DIR / user["id"]
    user_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{uuid.uuid4().hex[:16]}.webp"
    dest = user_dir / fname
    img.save(dest, format="WEBP", quality=85)
    return {"id": fname, "url": f"/portal-api/uploads/{fname}"}


@app.get("/portal-api/uploads/{filename}")
def serve_upload(filename: str, user: dict = Depends(get_current_user)) -> FileResponse:
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = UPLOAD_DIR / user["id"] / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path, media_type="image/webp")


# ---------------------------------------------------------------------------
# Streaming Chat Endpoint (SSE over OpenClaw /v1/responses)
# ---------------------------------------------------------------------------


class ChatStreamRequest(BaseModel):
    session_id: str
    content: str = Field(default="", max_length=20000)
    images: list[str] = Field(default_factory=list, max_length=4)


@app.post("/portal-api/chat/stream")
async def chat_stream(
    body: ChatStreamRequest, user: dict = Depends(get_current_user)
) -> StreamingResponse:
    text = body.content.strip()
    if not text and not body.images:
        raise HTTPException(status_code=400, detail="消息内容不能为空")

    # Resolve & validate uploaded images strictly inside current user's directory
    image_paths: list[Path] = []
    image_urls: list[str] = []
    for img_id in body.images:
        if "/" in img_id or "\\" in img_id or ".." in img_id:
            continue
        p = UPLOAD_DIR / user["id"] / img_id
        if p.exists():
            image_paths.append(p)
            image_urls.append(f"/portal-api/uploads/{img_id}")

    user_msg_id = uuid.uuid4().hex[:16]
    asst_msg_id = uuid.uuid4().hex[:16]
    ts = now_ms()

    with db_session() as conn:
        sess = _require_owned_session(conn, body.session_id, user["id"])
        conn.execute(
            """
            INSERT INTO chat_messages (id, session_id, role, content, images_json, created_at)
            VALUES (?, ?, 'user', ?, ?, ?)
            """,
            (user_msg_id, body.session_id, text, json.dumps(image_urls), ts),
        )
        # Auto-title new session from first user message
        new_title = sess["title"]
        if sess["title"] == "新对话" and text:
            new_title = text.replace("\n", " ")[:24]
        conn.execute(
            "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?",
            (new_title, ts, body.session_id),
        )

    async def event_generator():
        content_parts: list[str] = []
        thinking_parts: list[str] = []
        tools_map: dict[str, dict[str, str]] = {}
        usage_obj: dict[str, Any] = {}
        started_at = time.monotonic()

        # Emit initial metadata immediately -> triggers "✓ 已送达" receipt on frontend
        yield f"data: {json.dumps({'type': 'meta', 'user_message_id': user_msg_id, 'assistant_message_id': asst_msg_id, 'title': new_title, 'delivered_at': now_ms()}, ensure_ascii=False)}\n\n"

        queue: asyncio.Queue[Optional[dict[str, Any]]] = asyncio.Queue()

        async def _producer():
            try:
                async for ev in stream_openclaw_response(
                    user_id=user["id"],
                    session_id=body.session_id,
                    text=text or "请帮我看看这张图片",
                    image_paths=image_paths,
                ):
                    await queue.put(ev)
            finally:
                await queue.put(None)

        producer_task = asyncio.create_task(_producer())
        try:
            while True:
                try:
                    ev = await asyncio.wait_for(queue.get(), timeout=5.0)
                except asyncio.TimeoutError:
                    elapsed_ms = int((time.monotonic() - started_at) * 1000)
                    yield f"data: {json.dumps({'type': 'heartbeat', 'elapsed_ms': elapsed_ms}, ensure_ascii=False)}\n\n"
                    continue
                if ev is None:
                    break
                ev_type = ev.get("type")
                if ev_type == "delta":
                    content_parts.append(ev["text"])
                elif ev_type == "thinking":
                    thinking_parts.append(ev["delta"])
                elif ev_type == "tool":
                    tid = str(ev.get("id") or ev.get("name"))
                    tools_map[tid] = {
                        "id": tid,
                        "name": str(ev.get("name") or "tool"),
                        "status": str(ev.get("status") or "running"),
                    }
                elif ev_type == "done":
                    usage_obj = ev.get("usage") or {}
                    usage_obj["elapsed_ms"] = int((time.monotonic() - started_at) * 1000)
                    ev = {**ev, "usage": usage_obj}
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        finally:
            if not producer_task.done():
                producer_task.cancel()

        # Persist assistant turn in SQLite
        final_content = "".join(content_parts)
        final_thinking = "".join(thinking_parts)
        final_tools = list(tools_map.values())
        if final_content or final_thinking or final_tools:
            with db_session() as conn:
                conn.execute(
                    """
                    INSERT INTO chat_messages
                      (id, session_id, role, content, thinking, tools_json, usage_json, created_at)
                    VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
                    """,
                    (
                        asst_msg_id,
                        body.session_id,
                        final_content,
                        final_thinking,
                        json.dumps(final_tools, ensure_ascii=False),
                        json.dumps(usage_obj, ensure_ascii=False),
                        now_ms(),
                    ),
                )
                conn.execute(
                    "UPDATE chat_sessions SET updated_at = ? WHERE id = ?",
                    (now_ms(), body.session_id),
                )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/portal-api/status")
async def companion_status(user: dict = Depends(get_current_user)) -> dict:
    return await get_companion_status(user)


@app.get("/portal-api/health")
def health() -> dict:
    return {"ok": True}


# ---------------------------------------------------------------------------
# Serve built React SPA when present
# ---------------------------------------------------------------------------

if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "portal-assets"
    if assets_dir.exists():
        app.mount("/portal-assets", StaticFiles(directory=str(assets_dir)), name="portal-assets")
    legacy_assets = FRONTEND_DIST / "assets"
    if legacy_assets.exists():
        app.mount("/assets", StaticFiles(directory=str(legacy_assets)), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
