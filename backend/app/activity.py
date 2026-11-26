from __future__ import annotations

import datetime
import json
from collections import defaultdict
from typing import Any

from .db import db_session
from .vault import list_user_skills, list_user_vault_files

TZ_CN = datetime.timezone(datetime.timedelta(hours=8))


def _ts_to_date_str(ts_ms: int) -> str:
    dt = datetime.datetime.fromtimestamp(ts_ms / 1000.0, TZ_CN)
    return dt.strftime("%Y-%m-%d")


def _estimate_turn_tasks(tools_json: str | None, usage_json: str | None) -> int:
    """
    Count tasks/tool actions handled in an assistant turn:
    - Prefer exact recorded tool calls in tools_json.
    - For historical turns before the WS tool sidecar, infer substantive
      multi-step tool runs conservatively from usage tokens / elapsed_ms.
    """
    try:
        tools = json.loads(tools_json or "[]")
        if isinstance(tools, list) and len(tools) > 0:
            return len(tools)
    except Exception:
        pass

    try:
        usage = json.loads(usage_json or "{}")
        if isinstance(usage, dict):
            in_tok = int(usage.get("input_tokens") or 0)
            elapsed = int(usage.get("elapsed_ms") or 0)
            if in_tok >= 80_000:
                return max(2, min(25, round(in_tok / 40_000)))
            if elapsed >= 15_000:
                return 1
    except Exception:
        pass
    return 0


def _compute_level(score: int) -> int:
    if score <= 0:
        return 0
    if score <= 2:
        return 1
    if score <= 6:
        return 2
    if score <= 14:
        return 3
    return 4


def get_user_year_activity(user_id: str, year: int | None = None) -> dict[str, Any]:
    now_dt = datetime.datetime.now(TZ_CN)
    target_year = year or now_dt.year
    today_date = now_dt.date()

    day_turns: dict[str, int] = defaultdict(int)
    day_tasks: dict[str, int] = defaultdict(int)
    day_topics: dict[str, list[str]] = defaultdict(list)
    all_active_dates: set[datetime.date] = set()
    years_seen: set[int] = {now_dt.year}
    earliest_ts: int | None = None
    projects_count = 0
    total_sessions = 0

    with db_session() as conn:
        row_p = conn.execute(
            "SELECT COUNT(*) AS cnt FROM projects WHERE user_id = ?", (user_id,)
        ).fetchone()
        projects_count = int(row_p["cnt"]) if row_p else 0

        row_s = conn.execute(
            "SELECT COUNT(*) AS cnt FROM chat_sessions WHERE user_id = ?", (user_id,)
        ).fetchone()
        total_sessions = int(row_s["cnt"]) if row_s else 0

        rows = conn.execute(
            """
            SELECT m.role, m.tools_json, m.usage_json, m.created_at, s.title, s.is_main
            FROM chat_messages m
            JOIN chat_sessions s ON s.id = m.session_id
            WHERE s.user_id = ?
            ORDER BY m.created_at ASC
            """,
            (user_id,),
        ).fetchall()

    for r in rows:
        ts = int(r["created_at"] or 0)
        if ts <= 0:
            continue
        if earliest_ts is None or ts < earliest_ts:
            earliest_ts = ts
        dt = datetime.datetime.fromtimestamp(ts / 1000.0, TZ_CN)
        d_obj = dt.date()
        d_str = d_obj.strftime("%Y-%m-%d")
        years_seen.add(dt.year)
        all_active_dates.add(d_obj)

        if dt.year != target_year:
            continue

        if r["role"] == "user":
            day_turns[d_str] += 1
            title = str(r["title"] or "").strip()
            if title and title != "新对话" and title not in day_topics[d_str]:
                if len(day_topics[d_str]) < 4:
                    day_topics[d_str].append(title)
        elif r["role"] == "assistant":
            tasks = _estimate_turn_tasks(r["tools_json"], r["usage_json"])
            if tasks > 0:
                day_tasks[d_str] += tasks

    # Build sparse map for target_year days with activity
    days: dict[str, dict[str, Any]] = {}
    all_keys = sorted(set(day_turns.keys()) | set(day_tasks.keys()))
    year_turns = 0
    year_tasks = 0
    for k in all_keys:
        t = day_turns.get(k, 0)
        tk = day_tasks.get(k, 0)
        year_turns += t
        year_tasks += tk
        score = t + tk
        days[k] = {
            "date": k,
            "turns": t,
            "tasks": tk,
            "score": score,
            "level": _compute_level(score),
            "topics": day_topics.get(k, []),
        }

    # Compute current & longest streaks across all active dates
    sorted_dates = sorted(all_active_dates)
    longest_streak = 0
    run = 0
    prev_d: datetime.date | None = None
    for d in sorted_dates:
        if prev_d and (d - prev_d).days == 1:
            run += 1
        else:
            run = 1
        if run > longest_streak:
            longest_streak = run
        prev_d = d

    current_streak = 0
    cursor = today_date
    if cursor not in all_active_dates and (cursor - datetime.timedelta(days=1)) in all_active_dates:
        cursor = cursor - datetime.timedelta(days=1)
    while cursor in all_active_dates:
        current_streak += 1
        cursor = cursor - datetime.timedelta(days=1)

    companion_days = 1
    if earliest_ts:
        first_date = datetime.datetime.fromtimestamp(earliest_ts / 1000.0, TZ_CN).date()
        companion_days = max(1, (today_date - first_date).days + 1)

    skills = list_user_skills(user_id)
    vault_data = list_user_vault_files(user_id)
    vault_files_count = (
        len(vault_data.get("inbox", []))
        + len(vault_data.get("artifacts", []))
        + len(vault_data.get("archive", []))
    )

    return {
        "year": target_year,
        "today": today_date.strftime("%Y-%m-%d"),
        "available_years": sorted(years_seen, reverse=True),
        "summary": {
            "year_turns": year_turns,
            "year_tasks": year_tasks,
            "active_days": len(days),
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "companion_days": companion_days,
            "total_sessions": total_sessions,
            "projects_count": projects_count,
            "skills_count": len(skills),
            "vault_files_count": vault_files_count,
        },
        "days": days,
    }
