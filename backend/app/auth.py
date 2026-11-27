from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from typing import Any, Optional

from fastapi import Cookie, HTTPException, Response

from .config import COOKIE_MAX_AGE, COOKIE_NAME, COOKIE_SECURE, DEFAULT_SEED_USERS, SECRET_KEY
from .db import db_session, now_ms

# Profile fields safe to hand back to clients; token_version is deliberately excluded.
USER_PUBLIC_FIELDS = ("id", "display_name", "avatar_emoji", "assistant_name", "assistant_emoji")
_TOKEN_TTL_MS = COOKIE_MAX_AGE * 1000


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


def _number(value: Any) -> Optional[int]:
    """JSON number -> int. Rejects bools, strings, None and non-finite values."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        return int(value)
    except (OverflowError, ValueError):  # inf / nan
        return None


def create_session_token(user_id: str, token_version: int = 1) -> str:
    issued_at = now_ms()
    payload = json.dumps(
        {
            "uid": user_id,
            "ver": int(token_version),
            "exp": issued_at + _TOKEN_TTL_MS,
            "iat": issued_at,
        },
        separators=(",", ":"),
    ).encode("utf-8")
    b64 = base64.urlsafe_b64encode(payload).decode("ascii")
    return f"{b64}.{_sign(b64)}"


def verify_session_token(token: Optional[str]) -> Optional[tuple[str, int]]:
    """Return (user_id, token_version) for a correctly signed, unexpired token, else None.

    Tokens issued before "exp" existed stay valid for COOKIE_MAX_AGE counted from "iat".
    Anything malformed fails closed as None; this never raises.
    """
    if not token or "." not in token:
        return None
    b64, sig = token.rsplit(".", 1)
    try:
        if not hmac.compare_digest(_sign(b64), sig):
            return None
        data = json.loads(base64.urlsafe_b64decode(b64.encode("ascii")))
        if not isinstance(data, dict):
            return None
        uid = data.get("uid")
        iat = _number(data.get("iat"))
        exp = (
            _number(data.get("exp"))
            if "exp" in data
            else (iat + _TOKEN_TTL_MS if iat is not None else None)
        )
        if not isinstance(uid, str) or not uid or exp is None or now_ms() > exp:
            return None
        return uid, int(data.get("ver", 1))
    except Exception:
        return None


def stored_token_version(row: Any) -> int:
    """token_version of a users row (defaults to 1 if the column were ever NULL)."""
    return int(row["token_version"] or 1)


def set_auth_cookie(response: Response, user_id: str, token_version: int = 1) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_session_token(user_id, token_version),
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


def get_current_user(portal_session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)) -> dict:
    verified = verify_session_token(portal_session)
    if not verified:
        raise HTTPException(status_code=401, detail="Not authenticated")
    uid, token_ver = verified
    with db_session() as conn:
        row = conn.execute(
            "SELECT id, display_name, avatar_emoji, assistant_name, assistant_emoji, token_version"
            " FROM users WHERE id = ?",
            (uid,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    if stored_token_version(row) != token_ver:
        # Cookie predates a password change or logout-all: revoked server-side.
        raise HTTPException(status_code=401, detail="Session revoked")
    return {field: row[field] for field in USER_PUBLIC_FIELDS}
