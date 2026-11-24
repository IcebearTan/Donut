from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from typing import Optional

from fastapi import Cookie, HTTPException, Response

from .config import COOKIE_MAX_AGE, COOKIE_NAME, COOKIE_SECURE, DEFAULT_SEED_USERS, SECRET_KEY
from .db import db_session, now_ms


def hash_password(password: str, salt: Optional[str] = None) -> str:
    salt_bytes = bytes.fromhex(salt) if salt else secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 120_000)
    return f"pbkdf2${salt_bytes.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt_hex, expected_hex = stored.split("$", 2)
        if algo != "pbkdf2":
            return False
        candidate = hash_password(password, salt_hex)
        return hmac.compare_digest(candidate, stored)
    except Exception:
        return False


def seed_users() -> None:
    avatar_defaults = {"bear": "🐻", "her": "🌸"}
    with db_session() as conn:
        for item in DEFAULT_SEED_USERS.split(","):
            item = item.strip()
            if not item:
                continue
            parts = item.split(":")
            if len(parts) < 3:
                continue
            uid, raw_pw, display_name = parts[0].strip(), parts[1].strip(), parts[2].strip()
            existing = conn.execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone()
            if existing is None:
                conn.execute(
                    """
                    INSERT INTO users (id, display_name, pass_hash, avatar_emoji, assistant_name, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        uid,
                        display_name,
                        hash_password(raw_pw),
                        avatar_defaults.get(uid, "✨"),
                        "Donut",
                        now_ms(),
                    ),
                )


def _sign(payload_b64: str) -> str:
    return hmac.new(
        SECRET_KEY.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256
    ).hexdigest()


def create_session_token(user_id: str) -> str:
    payload = json.dumps({"uid": user_id, "iat": now_ms()}, separators=(",", ":")).encode("utf-8")
    b64 = base64.urlsafe_b64encode(payload).decode("ascii")
    return f"{b64}.{_sign(b64)}"


def verify_session_token(token: Optional[str]) -> Optional[str]:
    if not token or "." not in token:
        return None
    b64, sig = token.rsplit(".", 1)
    if not hmac.compare_digest(_sign(b64), sig):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(b64.encode("ascii")))
        uid = data.get("uid")
        return str(uid) if uid else None
    except Exception:
        return None


def set_auth_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_session_token(user_id),
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


def get_current_user(portal_session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)) -> dict:
    uid = verify_session_token(portal_session)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    with db_session() as conn:
        row = conn.execute(
            "SELECT id, display_name, avatar_emoji, assistant_name, assistant_emoji FROM users WHERE id = ?",
            (uid,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(row)
