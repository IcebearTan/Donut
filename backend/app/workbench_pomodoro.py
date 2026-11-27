from __future__ import annotations

import datetime
import json
import os
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .config import VAULT_DIR
from .db import now_ms

TZ_CN = datetime.timezone(datetime.timedelta(hours=8))
WEEKDAY_LABELS = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")
DEFAULT_TAGS = ("学习", "阅读", "刷题", "背单词", "写作")
MAX_STORED_SESSIONS = 1000

DEFAULT_SETTINGS: dict[str, Any] = {
    "focus_minutes": 25,
    "short_break_minutes": 5,
    "long_break_minutes": 15,
    "long_break_interval": 4,
    "daily_goal": 6,
    "sound_enabled": True,
    "wake_lock_enabled": True,
}


def get_pomodoro_file_path(user_id: str) -> Path:
    root = VAULT_DIR / user_id / "workbench"
    root.mkdir(parents=True, exist_ok=True)
    return root / "pomodoro.json"


def _clamp_int(val: Any, default: int, lo: int, hi: int) -> int:
    try:
        n = int(val)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def _normalize_settings(raw: Any) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    return {
        "focus_minutes": _clamp_int(src.get("focus_minutes"), 25, 5, 120),
        "short_break_minutes": _clamp_int(src.get("short_break_minutes"), 5, 1, 30),
        "long_break_minutes": _clamp_int(src.get("long_break_minutes"), 15, 5, 60),
        "long_break_interval": _clamp_int(src.get("long_break_interval"), 4, 2, 8),
        "daily_goal": _clamp_int(src.get("daily_goal"), 6, 1, 24),
        "sound_enabled": bool(src.get("sound_enabled", True)),
        "wake_lock_enabled": bool(src.get("wake_lock_enabled", True)),
    }


def _date_str_from_ms(ts_ms: int) -> str:
    dt = datetime.datetime.fromtimestamp(ts_ms / 1000.0, tz=TZ_CN)
    return dt.strftime("%Y-%m-%d")


def _normalize_session(raw: Any, fallback_ts: int) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    completed_at = _clamp_int(raw.get("completed_at"), fallback_ts, 0, 9_999_999_999_999)
    duration = _clamp_int(raw.get("duration_minutes"), 25, 1, 180)
    started_default = max(0, completed_at - duration * 60_000)
    started_at = _clamp_int(raw.get("started_at"), started_default, 0, completed_at)
    date_str = str(raw.get("date") or "").strip()
    if len(date_str) != 10:
        date_str = _date_str_from_ms(completed_at)
    sid = str(raw.get("id") or "").strip() or f"pom_{uuid.uuid4().hex[:10]}"
    client_id = str(raw.get("client_id") or "").strip()[:64]
    tag = str(raw.get("tag") or "").strip()[:24] or "学习"
    note = str(raw.get("note") or "").strip()[:120]
    return {
        "id": sid[:64],
        "client_id": client_id,
        "date": date_str,
        "started_at": started_at,
        "completed_at": completed_at,
        "duration_minutes": duration,
        "tag": tag,
        "note": note,
    }


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(str(tmp), str(path))


def _load_raw_pomodoro(user_id: str) -> dict[str, Any]:
    path = get_pomodoro_file_path(user_id)
    ts = now_ms()
    if not path.exists():
        return {"version": 1, "updated_at": ts, "settings": dict(DEFAULT_SETTINGS), "sessions": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("Pomodoro root must be dict")
    except Exception:
        return {"version": 1, "updated_at": ts, "settings": dict(DEFAULT_SETTINGS), "sessions": []}

    raw_sessions = data.get("sessions") if isinstance(data.get("sessions"), list) else []
    sessions: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for item in raw_sessions:
        norm = _normalize_session(item, ts)
        if norm and norm["id"] not in seen_ids:
            seen_ids.add(norm["id"])
            sessions.append(norm)
    sessions.sort(key=lambda x: x["completed_at"], reverse=True)

    return {
        "version": 1,
        "updated_at": int(data.get("updated_at") or ts),
        "settings": _normalize_settings(data.get("settings")),
        "sessions": sessions[:MAX_STORED_SESSIONS],
    }


def _compute_streak(day_counts: dict[str, int], today_date: datetime.date) -> int:
    cursor = today_date
    if day_counts.get(cursor.strftime("%Y-%m-%d"), 0) == 0:
        cursor = cursor - datetime.timedelta(days=1)
    streak = 0
    while day_counts.get(cursor.strftime("%Y-%m-%d"), 0) > 0:
        streak += 1
        cursor -= datetime.timedelta(days=1)
    return streak


def _build_pomodoro_response(doc: dict[str, Any]) -> dict[str, Any]:
    now_dt = datetime.datetime.now(TZ_CN)
    today_date = now_dt.date()
    today_str = today_date.strftime("%Y-%m-%d")

    sessions = sorted(doc["sessions"], key=lambda x: x["completed_at"], reverse=True)
    day_counts: dict[str, int] = {}
    day_minutes: dict[str, int] = {}
    tag_counts: dict[str, int] = {}

    for s in sessions:
        d = s["date"]
        day_counts[d] = day_counts.get(d, 0) + 1
        day_minutes[d] = day_minutes.get(d, 0) + int(s["duration_minutes"])
        tag = s.get("tag") or "学习"
        tag_counts[tag] = tag_counts.get(tag, 0) + 1

    today_sessions = [s for s in sessions if s["date"] == today_str]
    weekly: list[dict[str, Any]] = []
    for offset in range(6, -1, -1):
        d_obj = today_date - datetime.timedelta(days=offset)
        d_key = d_obj.strftime("%Y-%m-%d")
        weekly.append(
            {
                "date": d_key,
                "label": WEEKDAY_LABELS[d_obj.weekday()],
                "short_date": f"{d_obj.month}/{d_obj.day}",
                "tomatoes": day_counts.get(d_key, 0),
                "minutes": day_minutes.get(d_key, 0),
                "is_today": d_key == today_str,
            }
        )

    ordered_tags = [k for k, _ in sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0]))]
    for preset in DEFAULT_TAGS:
        if preset not in ordered_tags:
            ordered_tags.append(preset)

    settings = doc["settings"]
    return {
        "updated_at": doc["updated_at"],
        "today": today_str,
        "settings": settings,
        "summary": {
            "today_tomatoes": len(today_sessions),
            "today_minutes": day_minutes.get(today_str, 0),
            "daily_goal": int(settings["daily_goal"]),
            "total_tomatoes": len(sessions),
            "total_minutes": sum(int(s["duration_minutes"]) for s in sessions),
            "streak_days": _compute_streak(day_counts, today_date),
            "best_day_tomatoes": max(day_counts.values(), default=0),
        },
        "weekly": weekly,
        "today_sessions": today_sessions,
        "recent_sessions": sessions[:30],
        "tags": ordered_tags[:10],
    }


def get_pomodoro_state(user_id: str) -> dict[str, Any]:
    return _build_pomodoro_response(_load_raw_pomodoro(user_id))


def update_pomodoro_settings(user_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    doc = _load_raw_pomodoro(user_id)
    merged = {**doc["settings"], **patch}
    doc["settings"] = _normalize_settings(merged)
    doc["updated_at"] = now_ms()
    _atomic_write_json(get_pomodoro_file_path(user_id), doc)
    return {"ok": True, "state": _build_pomodoro_response(doc)}


def record_pomodoro_session(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    doc = _load_raw_pomodoro(user_id)
    ts = now_ms()
    client_id = str(payload.get("client_id") or "").strip()[:64]
    if client_id:
        for existing in doc["sessions"]:
            if existing.get("client_id") == client_id:
                return {"ok": True, "duplicated": True, "session": existing, "state": _build_pomodoro_response(doc)}

    completed_at = _clamp_int(payload.get("completed_at"), ts, 0, 9_999_999_999_999)
    duration = _clamp_int(payload.get("duration_minutes"), doc["settings"]["focus_minutes"], 1, 180)
    raw = {
        "id": f"pom_{uuid.uuid4().hex[:10]}",
        "client_id": client_id,
        "date": _date_str_from_ms(completed_at),
        "started_at": payload.get("started_at") or max(0, completed_at - duration * 60_000),
        "completed_at": completed_at,
        "duration_minutes": duration,
        "tag": payload.get("tag") or "学习",
        "note": payload.get("note") or "",
    }
    norm = _normalize_session(raw, ts)
    if not norm:
        raise HTTPException(status_code=400, detail="无效的番茄专注记录")

    doc["sessions"].insert(0, norm)
    doc["sessions"] = doc["sessions"][:MAX_STORED_SESSIONS]
    doc["updated_at"] = ts
    _atomic_write_json(get_pomodoro_file_path(user_id), doc)
    return {"ok": True, "duplicated": False, "session": norm, "state": _build_pomodoro_response(doc)}


def delete_pomodoro_session(user_id: str, session_id: str) -> dict[str, Any]:
    doc = _load_raw_pomodoro(user_id)
    next_sessions = [s for s in doc["sessions"] if s["id"] != session_id]
    if len(next_sessions) == len(doc["sessions"]):
        raise HTTPException(status_code=404, detail="未找到该番茄记录")
    doc["sessions"] = next_sessions
    doc["updated_at"] = now_ms()
    _atomic_write_json(get_pomodoro_file_path(user_id), doc)
    return {"ok": True, "state": _build_pomodoro_response(doc)}
