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
    GENERATED_DIR,
    ILAND_URL,
    MAX_IMAGE_UPLOAD_MB,
    MAX_UPLOAD_MB,
    SSO_SECRET,
    UPLOAD_DIR,
    USER_AGENT_MAP,
    get_registered_apps,
)
from .db import db_session, init_db, now_ms
from .openclaw_client import run_openclaw_once, stream_openclaw_response
from .persona import PERSONA_PRESETS, read_persona_files, write_persona_files
from .projects import (
    append_project_memory,
    archive_project_dir,
    build_turn_instructions,
    ensure_project_files,
    make_safe_slug,
    read_project_files,
    rebuild_projects_index,
)
from .activity import get_user_year_activity
from .status import get_companion_status
from .titler import generate_smart_title
from .vault import (
    delete_user_skill,
    ensure_user_vault,
    is_allowed_upload_ext,
    list_user_skills,
    list_user_tools,
    list_user_vault_files,
    read_user_skill,
    resolve_attachment_path,
    resolve_vault_file,
    sanitize_filename,
    save_user_skill,
)


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
    avatar_emoji: Optional[str] = Field(default=None, min_length=1, max_length=8)


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
    new_avatar = body.avatar_emoji.strip() if body.avatar_emoji else user["avatar_emoji"]
    with db_session() as conn:
        conflict = conn.execute(
            "SELECT id FROM users WHERE display_name = ? AND id != ?",
            (new_display, user["id"]),
        ).fetchone()
        if conflict:
            raise HTTPException(status_code=409, detail="这个称呼已经被另一位占用了")
        conn.execute(
            "UPDATE users SET display_name = ?, assistant_name = ?, avatar_emoji = ? WHERE id = ?",
            (new_display, new_assistant, new_avatar, user["id"]),
        )
    return {
        "user": {
            **user,
            "display_name": new_display,
            "assistant_name": new_assistant,
            "avatar_emoji": new_avatar,
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
# Isolated Projects & Markdown Memory Brain (Strictly scoped to current user!)
# ---------------------------------------------------------------------------


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    emoji: str = Field(default="📁", min_length=1, max_length=8)
    summary: str = Field(default="", max_length=160)
    brief_md: Optional[str] = Field(default=None, max_length=12000)


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    emoji: Optional[str] = Field(default=None, min_length=1, max_length=8)
    summary: Optional[str] = Field(default=None, max_length=160)
    brief_md: Optional[str] = Field(default=None, max_length=12000)
    memory_md: Optional[str] = Field(default=None, max_length=24000)


class DistillProjectRequest(BaseModel):
    session_id: str


def _require_owned_project(conn: Any, project_id: str, user_id: str) -> dict:
    row = conn.execute(
        "SELECT * FROM projects WHERE id = ? AND user_id = ?",
        (project_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="项目不存在或无权访问")
    return dict(row)


def _list_user_projects_raw(conn: Any, user_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT p.id, p.slug, p.name, p.emoji, p.summary, p.created_at, p.updated_at,
               (SELECT COUNT(*) FROM chat_sessions s WHERE s.project_id = p.id) AS session_count
        FROM projects p
        WHERE p.user_id = ?
        ORDER BY p.updated_at DESC
        """,
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/portal-api/projects")
def list_projects(user: dict = Depends(get_current_user)) -> dict:
    with db_session() as conn:
        items = _list_user_projects_raw(conn, user["id"])
    return {"projects": items}


@app.post("/portal-api/projects")
def create_project(
    body: CreateProjectRequest, user: dict = Depends(get_current_user)
) -> dict:
    name = body.name.strip()
    emoji = body.emoji.strip() or "📁"
    summary = body.summary.strip()
    pid = uuid.uuid4().hex[:12]
    ts = now_ms()

    with db_session() as conn:
        existing_slugs = {
            r["slug"]
            for r in conn.execute(
                "SELECT slug FROM projects WHERE user_id = ?", (user["id"],)
            ).fetchall()
        }
        slug = make_safe_slug(name, existing_slugs)
        conn.execute(
            """
            INSERT INTO projects (id, user_id, slug, name, emoji, summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (pid, user["id"], slug, name, emoji, summary, ts, ts),
        )
        all_projects = _list_user_projects_raw(conn, user["id"])

    files = ensure_project_files(
        user["id"], slug, name, summary=summary, brief_md=body.brief_md
    )
    rebuild_projects_index(user["id"], all_projects)
    return {
        "project": {
            "id": pid,
            "slug": slug,
            "name": name,
            "emoji": emoji,
            "summary": summary,
            "session_count": 0,
            "created_at": ts,
            "updated_at": ts,
            **files,
        }
    }


@app.get("/portal-api/projects/{project_id}")
def get_project_detail(
    project_id: str, user: dict = Depends(get_current_user)
) -> dict:
    with db_session() as conn:
        proj = _require_owned_project(conn, project_id, user["id"])
        cnt = conn.execute(
            "SELECT COUNT(*) AS c FROM chat_sessions WHERE project_id = ?", (project_id,)
        ).fetchone()["c"]
    files = ensure_project_files(user["id"], proj["slug"], proj["name"], proj["summary"])
    return {"project": {**proj, "session_count": cnt, **files}}


@app.put("/portal-api/projects/{project_id}")
def update_project(
    project_id: str,
    body: UpdateProjectRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    ts = now_ms()
    with db_session() as conn:
        proj = _require_owned_project(conn, project_id, user["id"])
        new_name = body.name.strip() if body.name is not None else proj["name"]
        new_emoji = body.emoji.strip() if body.emoji is not None else proj["emoji"]
        new_summary = body.summary.strip() if body.summary is not None else proj["summary"]
        conn.execute(
            """
            UPDATE projects
            SET name = ?, emoji = ?, summary = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (new_name, new_emoji or "📁", new_summary, ts, project_id, user["id"]),
        )
        all_projects = _list_user_projects_raw(conn, user["id"])
        cnt = conn.execute(
            "SELECT COUNT(*) AS c FROM chat_sessions WHERE project_id = ?", (project_id,)
        ).fetchone()["c"]

    files = ensure_project_files(
        user["id"],
        proj["slug"],
        new_name,
        summary=new_summary,
        brief_md=body.brief_md,
        memory_md=body.memory_md,
    )
    rebuild_projects_index(user["id"], all_projects)
    return {
        "project": {
            **proj,
            "name": new_name,
            "emoji": new_emoji or "📁",
            "summary": new_summary,
            "updated_at": ts,
            "session_count": cnt,
            **files,
        }
    }


@app.delete("/portal-api/projects/{project_id}")
def delete_project(project_id: str, user: dict = Depends(get_current_user)) -> dict:
    with db_session() as conn:
        proj = _require_owned_project(conn, project_id, user["id"])
        conn.execute(
            "DELETE FROM projects WHERE id = ? AND user_id = ?",
            (project_id, user["id"]),
        )
        all_projects = _list_user_projects_raw(conn, user["id"])
    archive_project_dir(user["id"], proj["slug"])
    rebuild_projects_index(user["id"], all_projects)
    return {"ok": True}


@app.post("/portal-api/projects/{project_id}/distill")
async def distill_session_to_project(
    project_id: str,
    body: DistillProjectRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """Ask the user's isolated Donut agent to distill key conclusions from a chat into MEMORY.md."""
    with db_session() as conn:
        proj = _require_owned_project(conn, project_id, user["id"])
        _require_owned_session(conn, body.session_id, user["id"])
        rows = conn.execute(
            """
            SELECT role, content
            FROM chat_messages
            WHERE session_id = ?
            ORDER BY created_at DESC
            LIMIT 20
            """,
            (body.session_id,),
        ).fetchall()

    if not rows:
        raise HTTPException(status_code=400, detail="当前对话还没有可沉淀的内容")

    transcript_lines = []
    for r in reversed(rows):
        role_label = "用户" if r["role"] == "user" else "助手"
        text = str(r["content"] or "").strip()
        if text:
            transcript_lines.append(f"{role_label}：{text[:800]}")
    transcript = "\n\n".join(transcript_lines)

    distill_prompt = (
        f"请把下面这段围绕项目「{proj['name']}」的对话提炼成精炼的 Markdown 项目记忆笔记（不要客套，不要重复标题）：\n"
        "- 用 3~6 条清晰要点总结：已敲定的决策、关键进展、新发现的信息、以及明确的下一步待办。\n"
        "- 每条简洁克制，方便未来新对话快速继承上下文。\n\n"
        f"--- 对话记录 ---\n{transcript}"
    )

    try:
        summary_md = await run_openclaw_once(
            user_id=user["id"],
            session_key_suffix=f"distill-{project_id}-{uuid.uuid4().hex[:6]}",
            prompt=distill_prompt,
            instructions="你是严谨的项目记忆整理助手，只输出精炼的中文 Markdown 要点列表，不要输出开场白或结尾寒暄。",
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"沉淀提炼失败: {exc}")

    if not summary_md:
        raise HTTPException(status_code=502, detail="未生成有效沉淀内容")

    updated_memory = append_project_memory(user["id"], proj["slug"], summary_md)
    ts = now_ms()
    with db_session() as conn:
        conn.execute(
            "UPDATE projects SET updated_at = ? WHERE id = ? AND user_id = ?",
            (ts, project_id, user["id"]),
        )
        all_projects = _list_user_projects_raw(conn, user["id"])
    rebuild_projects_index(user["id"], all_projects)
    return {"ok": True, "appended": summary_md, "memory_md": updated_memory}


# ---------------------------------------------------------------------------
# Isolated Chat Sessions (Strictly scoped to current user!)
# ---------------------------------------------------------------------------


class CreateSessionRequest(BaseModel):
    title: str = Field(default="新对话", max_length=80)
    project_id: Optional[str] = Field(default=None, max_length=32)


class UpdateSessionRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=80)
    project_id: Optional[str] = Field(default=None, max_length=32)


def _require_owned_session(conn: Any, session_id: str, user_id: str) -> dict:
    row = conn.execute(
        "SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?",
        (session_id, user_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="会话不存在或无权访问")
    return dict(row)


def _ensure_main_session(conn: Any, user_id: str) -> dict:
    row = conn.execute(
        """
        SELECT id, title, space_type, project_id, is_main, created_at, updated_at
        FROM chat_sessions
        WHERE user_id = ? AND is_main = 1
        ORDER BY created_at ASC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    if row:
        return dict(row)
    sid = f"main-{user_id}"
    ts = now_ms()
    conn.execute(
        """
        INSERT INTO chat_sessions (id, user_id, space_type, title, project_id, is_main, created_at, updated_at)
        VALUES (?, ?, 'personal', '主对话', NULL, 1, ?, ?)
        """,
        (sid, user_id, ts, ts),
    )
    return {
        "id": sid,
        "title": "主对话",
        "space_type": "personal",
        "project_id": None,
        "is_main": 1,
        "created_at": ts,
        "updated_at": ts,
    }


@app.get("/portal-api/sessions")
def list_sessions(user: dict = Depends(get_current_user)) -> dict:
    with db_session() as conn:
        _ensure_main_session(conn, user["id"])
        rows = conn.execute(
            """
            SELECT id, title, space_type, project_id, is_main, created_at, updated_at
            FROM chat_sessions
            WHERE user_id = ?
            ORDER BY is_main DESC, updated_at DESC
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
    pid = body.project_id
    with db_session() as conn:
        if pid:
            _require_owned_project(conn, pid, user["id"])
        conn.execute(
            """
            INSERT INTO chat_sessions (id, user_id, space_type, title, project_id, is_main, created_at, updated_at)
            VALUES (?, ?, 'personal', ?, ?, 0, ?, ?)
            """,
            (sid, user["id"], title, pid, ts, ts),
        )
    return {
        "session": {
            "id": sid,
            "title": title,
            "space_type": "personal",
            "project_id": pid,
            "is_main": 0,
            "created_at": ts,
            "updated_at": ts,
        }
    }


@app.patch("/portal-api/sessions/{session_id}")
def update_session(
    session_id: str,
    body: UpdateSessionRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    fields = body.model_fields_set
    with db_session() as conn:
        sess = _require_owned_session(conn, session_id, user["id"])
        if sess.get("is_main"):
            raise HTTPException(status_code=400, detail="主对话不可修改名称或移动")

        new_title = sess["title"]
        if "title" in fields and body.title is not None:
            new_title = body.title.strip() or sess["title"]

        new_pid = sess.get("project_id")
        if "project_id" in fields:
            pid = (body.project_id or "").strip() or None
            if pid:
                _require_owned_project(conn, pid, user["id"])
            new_pid = pid

        ts = now_ms()
        conn.execute(
            "UPDATE chat_sessions SET title = ?, project_id = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (new_title, new_pid, ts, session_id, user["id"]),
        )
    return {
        "ok": True,
        "title": new_title,
        "project_id": new_pid,
        "session": {
            "id": session_id,
            "title": new_title,
            "space_type": sess["space_type"],
            "project_id": new_pid,
            "is_main": sess.get("is_main", 0),
            "created_at": sess["created_at"],
            "updated_at": ts,
        },
    }


@app.post("/portal-api/sessions/{session_id}/auto-title")
async def auto_title_session(
    session_id: str, user: dict = Depends(get_current_user)
) -> dict:
    """Re-distill a crisp GPT-style title from the conversation's opening exchange."""
    with db_session() as conn:
        sess = _require_owned_session(conn, session_id, user["id"])
        if sess.get("is_main"):
            raise HTTPException(status_code=400, detail="主对话名称不可修改")
        rows = conn.execute(
            """
            SELECT role, content
            FROM chat_messages
            WHERE session_id = ?
            ORDER BY created_at ASC
            LIMIT 4
            """,
            (session_id,),
        ).fetchall()

    if not rows:
        raise HTTPException(status_code=400, detail="对话还没有内容，无法提炼标题")

    user_text = "\n".join(str(r["content"] or "") for r in rows if r["role"] == "user")
    asst_text = "\n".join(str(r["content"] or "") for r in rows if r["role"] == "assistant")
    smart_title = await generate_smart_title(user_text, asst_text)
    if not smart_title:
        raise HTTPException(status_code=502, detail="标题提炼暂不可用，请稍后重试")

    with db_session() as conn:
        conn.execute(
            "UPDATE chat_sessions SET title = ? WHERE id = ? AND user_id = ?",
            (smart_title, session_id, user["id"]),
        )
    return {"ok": True, "title": smart_title}


@app.delete("/portal-api/sessions/{session_id}")
def delete_session(session_id: str, user: dict = Depends(get_current_user)) -> dict:
    with db_session() as conn:
        sess = _require_owned_session(conn, session_id, user["id"])
        if sess.get("is_main"):
            raise HTTPException(status_code=400, detail="主对话不可删除")
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
# User-Isolated File Vault (inbox / artifacts / archive) & Self-Evolved Skills
# ---------------------------------------------------------------------------


CHUNK_SIZE = 1024 * 1024  # 1MB chunked streaming to disk (zero RAM spike for large files)


async def _stream_upload_to_path(file: UploadFile, dest: Path, max_bytes: int) -> int:
    total = 0
    try:
        with dest.open("wb") as f:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"单个文件不能超过 {max_bytes // (1024 * 1024)}MB",
                    )
                f.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    return total


@app.post("/portal-api/uploads")
async def upload_image(
    file: UploadFile = File(...), user: dict = Depends(get_current_user)
) -> dict:
    max_img_bytes = MAX_IMAGE_UPLOAD_MB * 1024 * 1024
    raw = await file.read(max_img_bytes + 1)
    if len(raw) > max_img_bytes:
        raise HTTPException(status_code=413, detail=f"图片不能超过 {MAX_IMAGE_UPLOAD_MB}MB")
    try:
        img = Image.open(BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        img.thumbnail((1600, 1600))
    except Exception:
        raise HTTPException(status_code=400, detail="不支持的图片格式")

    dirs = ensure_user_vault(user["id"])
    fname = f"img_{uuid.uuid4().hex[:12]}.webp"
    dest = dirs["inbox"] / fname
    img.save(dest, format="WEBP", quality=85)
    return {
        "id": fname,
        "name": file.filename or fname,
        "url": f"/portal-api/vault/download/inbox/{fname}",
        "is_image": True,
        "size": dest.stat().st_size,
        "ext": ".webp",
    }


@app.post("/portal-api/vault/upload")
async def upload_vault_file(
    file: UploadFile = File(...), user: dict = Depends(get_current_user)
) -> dict:
    """Universal per-user file upload (chunked streaming to disk, up to MAX_UPLOAD_MB)."""
    orig_name = file.filename or "file"
    ext = Path(orig_name).suffix.lower()
    ctype = (file.content_type or "").lower()
    is_raster_image = ctype.startswith("image/") and ext in {".png", ".jpg", ".jpeg", ".webp", ".gif", ""}
    if ext in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        is_raster_image = True

    if not is_raster_image and not is_allowed_upload_ext(ext):
        raise HTTPException(
            status_code=400,
            detail=f"出于安全考虑暂不支持 {ext} 可执行文件，建议压缩为 ZIP 后上传",
        )

    dirs = ensure_user_vault(user["id"])

    if is_raster_image:
        max_img_bytes = MAX_IMAGE_UPLOAD_MB * 1024 * 1024
        raw = await file.read(max_img_bytes + 1)
        if len(raw) > max_img_bytes:
            raise HTTPException(status_code=413, detail=f"单张图片不能超过 {MAX_IMAGE_UPLOAD_MB}MB")
        try:
            img = Image.open(BytesIO(raw))
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            img.thumbnail((1600, 1600))
        except Exception:
            raise HTTPException(status_code=400, detail="不支持的图片格式")
        fname = f"img_{uuid.uuid4().hex[:12]}.webp"
        dest = dirs["inbox"] / fname
        img.save(dest, format="WEBP", quality=85)
        return {
            "id": fname,
            "name": orig_name,
            "url": f"/portal-api/vault/download/inbox/{fname}",
            "is_image": True,
            "size": dest.stat().st_size,
            "ext": ".webp",
        }

    safe_base = sanitize_filename(orig_name, fallback_ext=ext)
    dest = dirs["inbox"] / safe_base
    if dest.exists():
        stem = Path(safe_base).stem
        safe_base = f"{stem}_{uuid.uuid4().hex[:6]}{ext}"
        dest = dirs["inbox"] / safe_base

    written = await _stream_upload_to_path(file, dest, MAX_UPLOAD_MB * 1024 * 1024)
    return {
        "id": safe_base,
        "name": orig_name,
        "url": f"/portal-api/vault/download/inbox/{safe_base}",
        "is_image": False,
        "size": written,
        "ext": ext,
    }


@app.get("/portal-api/vault/files")
def list_vault_files(user: dict = Depends(get_current_user)) -> dict:
    return list_user_vault_files(user["id"])


@app.get("/portal-api/vault/download/{scope}/{file_path:path}")
def download_vault_file(
    scope: str, file_path: str, user: dict = Depends(get_current_user)
) -> FileResponse:
    target = resolve_vault_file(user["id"], scope, file_path)
    if not target or not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    if target.suffix.lower() == ".webp":
        return FileResponse(target, media_type="image/webp")
    return FileResponse(target, filename=target.name)


@app.delete("/portal-api/vault/files/{scope}/{file_path:path}")
def delete_vault_file(
    scope: str, file_path: str, user: dict = Depends(get_current_user)
) -> dict:
    target = resolve_vault_file(user["id"], scope, file_path)
    if not target or not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    target.unlink(missing_ok=True)
    return {"ok": True}


class SaveSkillRequest(BaseModel):
    content: str = Field(min_length=1, max_length=40000)


@app.get("/portal-api/skills")
def get_user_skills(user: dict = Depends(get_current_user)) -> dict:
    return {
        "skills": list_user_skills(user["id"]),
        "tools": list_user_tools(user["id"]),
    }


@app.get("/portal-api/skills/{skill_id}")
def get_user_skill_detail(skill_id: str, user: dict = Depends(get_current_user)) -> dict:
    detail = read_user_skill(user["id"], skill_id)
    if not detail:
        raise HTTPException(status_code=404, detail="技能不存在")
    return {"skill": detail}


@app.put("/portal-api/skills/{skill_id}")
def put_user_skill(
    skill_id: str,
    body: SaveSkillRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    saved = save_user_skill(user["id"], skill_id, body.content)
    if not saved:
        raise HTTPException(
            status_code=400,
            detail="技能 ID 仅支持小写字母、数字、连字符或下划线（如 weekly-report）",
        )
    return {"skill": saved}


@app.delete("/portal-api/skills/{skill_id}")
def remove_user_skill(skill_id: str, user: dict = Depends(get_current_user)) -> dict:
    if not delete_user_skill(user["id"], skill_id):
        raise HTTPException(status_code=404, detail="技能不存在")
    return {"ok": True}


@app.get("/portal-api/activity/year")
def get_annual_activity(
    year: Optional[int] = None, user: dict = Depends(get_current_user)
) -> dict:
    return get_user_year_activity(user["id"], year=year)


@app.get("/portal-api/uploads/{filename}")
def serve_upload(filename: str, user: dict = Depends(get_current_user)) -> FileResponse:
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    dirs = ensure_user_vault(user["id"])
    for candidate in (dirs["inbox"] / filename, UPLOAD_DIR / user["id"] / filename):
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate, media_type="image/webp")
    raise HTTPException(status_code=404, detail="Image not found")


@app.get("/portal-api/files/{filename}")
def serve_generated_file(filename: str, user: dict = Depends(get_current_user)) -> FileResponse:
    """Download user-isolated generated files (checks vault/artifacts first, then legacy generated/)."""
    if "/" in filename or "\\" in filename or ".." in filename or not filename.strip():
        raise HTTPException(status_code=400, detail="Invalid filename")
    dirs = ensure_user_vault(user["id"])
    for candidate in (dirs["artifacts"] / filename, GENERATED_DIR / user["id"] / filename):
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate, filename=filename)
    raise HTTPException(status_code=404, detail="File not found")


# ---------------------------------------------------------------------------
# Streaming Chat Endpoint (SSE over OpenClaw /v1/responses)
# ---------------------------------------------------------------------------


class ChatStreamRequest(BaseModel):
    session_id: str
    content: str = Field(default="", max_length=20000)
    images: list[str] = Field(default_factory=list, max_length=10)
    attachments: list[str] = Field(default_factory=list, max_length=10)


@app.post("/portal-api/chat/stream")
async def chat_stream(
    body: ChatStreamRequest, user: dict = Depends(get_current_user)
) -> StreamingResponse:
    text = body.content.strip()
    raw_file_ids = list(dict.fromkeys([*(body.images or []), *(body.attachments or [])]))
    if not text and not raw_file_ids:
        raise HTTPException(status_code=400, detail="消息内容不能为空")

    # Resolve & validate uploaded images & documents strictly inside current user's isolated vault
    image_paths: list[Path] = []
    doc_paths: list[Path] = []
    display_image_urls: list[str] = []
    doc_display_names: list[str] = []

    for fid in raw_file_ids:
        p, url, is_img = resolve_attachment_path(user["id"], fid)
        if not p:
            continue
        if is_img:
            image_paths.append(p)
            display_image_urls.append(url)
        else:
            doc_paths.append(p)
            doc_display_names.append(p.name)

    display_text = text
    if doc_display_names:
        chips_line = " ".join(f"📎 `{name}`" for name in doc_display_names)
        display_text = f"{display_text}\n\n{chips_line}".strip() if display_text else chips_line

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
            (user_msg_id, body.session_id, display_text, json.dumps(display_image_urls), ts),
        )
        # Auto-title non-main new sessions: fast placeholder first, then GPT-style refinement after reply
        new_title = sess["title"]
        should_auto_title = False
        if not sess.get("is_main") and sess["title"] == "新对话" and (text or doc_display_names):
            seed_title = text or f"文件：{doc_display_names[0]}"
            new_title = seed_title.replace("\n", " ")[:18]
            should_auto_title = True
        conn.execute(
            "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?",
            (new_title, ts, body.session_id),
        )
        all_projects = _list_user_projects_raw(conn, user["id"])
        active_project = (
            next((p for p in all_projects if p["id"] == sess.get("project_id")), None)
            if sess.get("project_id")
            else None
        )

    turn_instructions = build_turn_instructions(user["id"], active_project, all_projects)

    # Keep system prompt prefix 100% static so DeepSeek KV-cache hits at 95%+ (50x cheaper!).
    # Append per-turn uploaded file paths at the TAIL of the user message payload.
    ensure_user_vault(user["id"])
    openclaw_text = text or ("请帮我看看这些附件" if doc_paths else "请帮我看看这张图片")
    all_attached = [*image_paths, *doc_paths]
    if all_attached:
        paths_list = "\n".join(f"- {p}" for p in all_attached)
        openclaw_text = (
            f"{openclaw_text}\n\n"
            f"[本次上传附件在用户隔离仓中的本地路径（可直接读取、整理、合并或归档到 vault/archive/）：\n{paths_list}]"
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
                    text=openclaw_text,
                    image_paths=image_paths,
                    instructions=turn_instructions or None,
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

            if should_auto_title and final_content:
                seed_user = text or ("附件：" + ", ".join(doc_display_names))
                smart_title = await generate_smart_title(seed_user, final_content)
                if smart_title and smart_title != new_title:
                    with db_session() as conn:
                        conn.execute(
                            "UPDATE chat_sessions SET title = ? WHERE id = ? AND user_id = ?",
                            (smart_title, body.session_id, user["id"]),
                        )
                    yield f"data: {json.dumps({'type': 'title', 'title': smart_title}, ensure_ascii=False)}\n\n"

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
            headers = {}
            if full_path in ("sw.js", "manifest.webmanifest"):
                headers["Cache-Control"] = "no-cache"
            return FileResponse(candidate, headers=headers)
        return FileResponse(FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-cache"})
