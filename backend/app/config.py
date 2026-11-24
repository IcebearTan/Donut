from __future__ import annotations

import json
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("PORTAL_DATA_DIR", str(BASE_DIR / "data")))
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "portal.db"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

COOKIE_NAME = "portal_session"
COOKIE_SECURE = os.environ.get("PORTAL_COOKIE_SECURE", "0") == "1"
COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

# Persistent signing secret (auto-generated on first run inside data/.secret)
_secret_file = DATA_DIR / ".secret"
if os.environ.get("PORTAL_SECRET"):
    SECRET_KEY = os.environ["PORTAL_SECRET"]
elif _secret_file.exists():
    SECRET_KEY = _secret_file.read_text(encoding="utf-8").strip()
else:
    SECRET_KEY = secrets.token_hex(32)
    _secret_file.write_text(SECRET_KEY, encoding="utf-8")
    try:
        os.chmod(_secret_file, 0o600)
    except OSError:
        pass

# OpenClaw Gateway connection (strictly server-side, never exposed to browsers)
OPENCLAW_GATEWAY_URL = os.environ.get(
    "OPENCLAW_GATEWAY_URL", "http://127.0.0.1:18789"
).rstrip("/")


def load_openclaw_token() -> str:
    env_tok = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "").strip()
    if env_tok:
        return env_tok
    oc_cfg = Path.home() / ".openclaw" / "openclaw.json"
    if oc_cfg.exists():
        try:
            data = json.loads(oc_cfg.read_text(encoding="utf-8"))
            tok = data.get("gateway", {}).get("auth", {}).get("token", "")
            if tok:
                return str(tok)
        except Exception:
            pass
    return ""


# Map Portal user identity key -> OpenClaw isolated agent ID
# 'bear' maps to 'main' (preserving existing Donut memory & Notion MCP)
# 'her'  maps to 'her'  (fully isolated workspace, memory, and DeepSeek models)
USER_AGENT_MAP: dict[str, str] = {
    "bear": os.environ.get("PORTAL_AGENT_BEAR", "main"),
    "her": os.environ.get("PORTAL_AGENT_HER", "her"),
}

# Seed users matching I-land defaults (override via PORTAL_SEED_USERS="bear:pw:小熊,her:pw:她")
DEFAULT_SEED_USERS = os.environ.get(
    "PORTAL_SEED_USERS", "bear:123456:小熊,her:123456:她"
)

# Extensible Portal App Registry — add future sub-apps here!
ILAND_URL = os.environ.get("PORTAL_ILAND_URL", "/island/")
SSO_SECRET = os.environ.get("PORTAL_SSO_SECRET", "").strip()


def get_registered_apps(user_key: str) -> list[dict]:
    apps = [
        {
            "id": "donut",
            "name": "Donut 陪伴",
            "shortName": "Donut",
            "emoji": "🍩",
            "description": "个人 AI 陪伴与日程助手",
            "type": "internal",
            "path": "/",
            "badge": "默认",
        },
        {
            "id": "iland",
            "name": "I-land 小岛",
            "shortName": "登岛",
            "emoji": "🏝️",
            "description": "我们的双人像素小岛",
            "type": "link",
            "path": ILAND_URL,
            "badge": "双人空间",
        },
    ]
    # Future apps can be filtered by user_key (e.g. bear-only invoice dashboard, her study planner)
    _ = user_key
    return apps
