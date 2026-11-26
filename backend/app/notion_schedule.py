from __future__ import annotations

import datetime
import json
import time
from typing import Any, Optional

import httpx
from fastapi import HTTPException

from .db import db_session, now_ms

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"
PROVIDER_KEY = "notion_schedule"

# Lightweight 30s per-user query cache so switching tabs is instantaneous and hits 0 LLM tokens
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_SEC = 30.0


def _mask_token(token: str) -> str:
    t = token.strip()
    if len(t) <= 10:
        return "***" if t else ""
    return f"{t[:6]}••••{t[-4:]}"


def _notion_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token.strip()}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _load_integration(user_id: str) -> Optional[dict[str, Any]]:
    with db_session() as conn:
        row = conn.execute(
            """
            SELECT secret_token, config_json, updated_at
            FROM user_integrations
            WHERE user_id = ? AND provider = ?
            """,
            (user_id, PROVIDER_KEY),
        ).fetchone()
    if not row:
        return None
    try:
        cfg = json.loads(row["config_json"] or "{}")
    except Exception:
        cfg = {}
    return {
        "token": str(row["secret_token"] or "").strip(),
        "config": cfg if isinstance(cfg, dict) else {},
        "updated_at": row["updated_at"],
    }


def _save_integration(user_id: str, token: str, config: dict[str, Any]) -> None:
    ts = now_ms()
    with db_session() as conn:
        conn.execute(
            """
            INSERT INTO user_integrations (user_id, provider, secret_token, config_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
                secret_token = excluded.secret_token,
                config_json = excluded.config_json,
                updated_at = excluded.updated_at
            """,
            (
                user_id,
                PROVIDER_KEY,
                token.strip(),
                json.dumps(config, ensure_ascii=False),
                ts,
            ),
        )
    _CACHE.pop(user_id, None)


def clear_notion_schedule_config(user_id: str) -> dict[str, Any]:
    with db_session() as conn:
        conn.execute(
            "DELETE FROM user_integrations WHERE user_id = ? AND provider = ?",
            (user_id, PROVIDER_KEY),
        )
    _CACHE.pop(user_id, None)
    return {"ok": True}


def get_notion_schedule_config(user_id: str) -> dict[str, Any]:
    saved = _load_integration(user_id)
    if not saved or not saved["token"]:
        return {
            "configured": False,
            "has_token": False,
            "masked_token": "",
            "database_id": "",
            "database_name": "",
        }
    cfg = saved["config"]
    db_id = str(cfg.get("database_id") or "")
    return {
        "configured": bool(saved["token"] and db_id),
        "has_token": bool(saved["token"]),
        "masked_token": _mask_token(saved["token"]),
        "database_id": db_id,
        "database_name": str(cfg.get("database_name") or ""),
    }


def _extract_plain_text(rich_list: Any) -> str:
    if not isinstance(rich_list, list):
        return ""
    return "".join(str(x.get("plain_text") or "") for x in rich_list if isinstance(x, dict)).strip()


async def discover_notion_databases(
    user_id: str, token_override: Optional[str] = None
) -> list[dict[str, Any]]:
    token = (token_override or "").strip()
    if not token:
        saved = _load_integration(user_id)
        token = saved["token"] if saved else ""
    if not token:
        raise HTTPException(status_code=400, detail="请先填入 Notion Integration Token")

    timeout = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{NOTION_API_BASE}/search",
                headers=_notion_headers(token),
                json={
                    "filter": {"value": "database", "property": "object"},
                    "page_size": 50,
                },
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"无法连接 Notion API: {exc}")

    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Notion Token 无效或已过期，请检查后重试")
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502, detail=f"Notion API 错误 ({resp.status_code}): {resp.text[:200]}"
        )

    data = resp.json()
    dbs: list[dict[str, Any]] = []
    for item in data.get("results") or []:
        if item.get("object") != "database":
            continue
        title = _extract_plain_text(item.get("title")) or "未命名数据库"
        props = item.get("properties") or {}
        dbs.append(
            {
                "id": str(item.get("id") or ""),
                "name": title,
                "url": str(item.get("url") or ""),
                "property_names": list(props.keys())[:12],
            }
        )
    return dbs


async def save_notion_schedule_config(
    *,
    user_id: str,
    token: Optional[str],
    database_id: str,
    database_name: str = "",
) -> dict[str, Any]:
    saved = _load_integration(user_id)
    final_token = (token or "").strip() or (saved["token"] if saved else "")
    if not final_token:
        raise HTTPException(status_code=400, detail="请提供 Notion Integration Token")
    clean_db_id = database_id.strip()
    if not clean_db_id:
        raise HTTPException(status_code=400, detail="请选择或填写 Notion 数据库 ID")

    # Verify token + database access right away and cache property schema
    timeout = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                f"{NOTION_API_BASE}/databases/{clean_db_id}",
                headers=_notion_headers(final_token),
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"连接 Notion 失败: {exc}")

    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Notion Token 无效")
    if resp.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail="找不到该数据库，请确认已在 Notion 数据库右上角「Connections」里授权该 Integration",
        )
    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502, detail=f"验证数据库失败 ({resp.status_code}): {resp.text[:200]}"
        )

    db_obj = resp.json()
    resolved_name = database_name.strip() or _extract_plain_text(db_obj.get("title")) or "Notion 日程"
    schema_map = _infer_property_map(db_obj.get("properties") or {})

    _save_integration(
        user_id,
        final_token,
        {
            "database_id": clean_db_id,
            "database_name": resolved_name,
            "database_url": str(db_obj.get("url") or ""),
            "schema": schema_map,
        },
    )
    return get_notion_schedule_config(user_id)


def _infer_property_map(properties: dict[str, Any]) -> dict[str, Any]:
    """Auto-detect title, date, done/status, priority, and category/tag columns."""
    title_prop = ""
    date_prop = ""
    checkbox_prop = ""
    status_prop = ""
    status_type = ""
    done_option = ""
    todo_option = ""
    priority_prop = ""
    tag_prop = ""

    def pick(preferred_words: tuple[str, ...], allowed_types: tuple[str, ...]) -> tuple[str, dict[str, Any]]:
        candidates = [
            (name, spec)
            for name, spec in properties.items()
            if isinstance(spec, dict) and spec.get("type") in allowed_types
        ]
        for word in preferred_words:
            for name, spec in candidates:
                if word in name.lower():
                    return name, spec
        return (candidates[0] if candidates else ("", {}))

    title_prop, _ = pick(("任务", "事项", "日程", "标题", "名称", "name", "title", "task"), ("title",))
    date_prop, _ = pick(("截止", "日期", "时间", "ddl", "due", "date", "time", "start"), ("date",))
    checkbox_prop, _ = pick(("完成", "done", "check", "状态"), ("checkbox",))
    status_prop, status_spec = pick(("状态", "进度", "status", "state"), ("status", "select"))
    if status_prop and status_spec:
        status_type = str(status_spec.get("type") or "")
        opts = (status_spec.get(status_type) or {}).get("options") or []
        opt_names = [str(o.get("name") or "") for o in opts if isinstance(o, dict)]
        for o in opt_names:
            low = o.lower()
            if any(k in low for k in ("完成", "done", "complete", "已结束", "closed")):
                done_option = o
                break
        for o in opt_names:
            low = o.lower()
            if any(k in low for k in ("待", "未", "todo", "not started", "进行", "in progress")):
                todo_option = o
                break
        if not done_option and opt_names:
            done_option = opt_names[-1]
        if not todo_option and opt_names:
            todo_option = opt_names[0]

    priority_prop, _ = pick(("优先", "重要", "级别", "priority"), ("select", "status"))
    if priority_prop == status_prop:
        priority_prop = ""
    tag_prop, _ = pick(("标签", "分类", "类型", "项目", "tag", "category", "project"), ("multi_select", "select"))
    if tag_prop in (status_prop, priority_prop):
        tag_prop = ""

    return {
        "title": title_prop,
        "date": date_prop,
        "checkbox": checkbox_prop,
        "status": status_prop,
        "status_type": status_type,
        "done_option": done_option,
        "todo_option": todo_option,
        "priority": priority_prop,
        "tag": tag_prop,
    }


def _today_iso_utc8() -> str:
    tz = datetime.timezone(datetime.timedelta(hours=8))
    return datetime.datetime.now(tz).strftime("%Y-%m-%d")


def _extract_item(page: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    props = page.get("properties") or {}

    # Title
    title = ""
    t_key = schema.get("title")
    if t_key and isinstance(props.get(t_key), dict):
        title = _extract_plain_text(props[t_key].get("title"))
    if not title:
        for spec in props.values():
            if isinstance(spec, dict) and spec.get("type") == "title":
                title = _extract_plain_text(spec.get("title"))
                if title:
                    break
    title = title or "未命名日程"

    # Date
    date_start = ""
    date_end = ""
    d_key = schema.get("date")
    if d_key and isinstance(props.get(d_key), dict):
        d_obj = props[d_key].get("date") or {}
        if isinstance(d_obj, dict):
            date_start = str(d_obj.get("start") or "")
            date_end = str(d_obj.get("end") or "")

    # Done & status text
    done = False
    status_label = ""
    c_key = schema.get("checkbox")
    s_key = schema.get("status")
    s_type = schema.get("status_type") or "status"
    if c_key and isinstance(props.get(c_key), dict):
        done = bool(props[c_key].get("checkbox"))
    if s_key and isinstance(props.get(s_key), dict):
        s_val = props[s_key].get(s_type) or props[s_key].get("status") or props[s_key].get("select")
        if isinstance(s_val, dict):
            status_label = str(s_val.get("name") or "")
            low = status_label.lower()
            if not c_key and any(k in low for k in ("完成", "done", "complete", "已结束", "归档")):
                done = True

    # Priority
    priority = ""
    p_key = schema.get("priority")
    if p_key and isinstance(props.get(p_key), dict):
        p_val = props[p_key].get("select") or props[p_key].get("status")
        if isinstance(p_val, dict):
            priority = str(p_val.get("name") or "")

    # Tags
    tags: list[str] = []
    tag_key = schema.get("tag")
    if tag_key and isinstance(props.get(tag_key), dict):
        t_spec = props[tag_key]
        if t_spec.get("type") == "multi_select":
            tags = [str(o.get("name") or "") for o in (t_spec.get("multi_select") or []) if o.get("name")]
        elif t_spec.get("type") == "select" and isinstance(t_spec.get("select"), dict):
            nm = str(t_spec["select"].get("name") or "")
            if nm:
                tags = [nm]

    # Bucket classification (overdue / today / upcoming / nodate / done)
    today_str = _today_iso_utc8()
    date_day = date_start[:10] if len(date_start) >= 10 else ""
    if done:
        bucket = "done"
    elif not date_day:
        bucket = "nodate"
    elif date_day < today_str:
        bucket = "overdue"
    elif date_day == today_str:
        bucket = "today"
    else:
        bucket = "upcoming"

    return {
        "id": str(page.get("id") or ""),
        "title": title,
        "date_start": date_start,
        "date_end": date_end,
        "done": done,
        "status": status_label,
        "priority": priority,
        "tags": tags,
        "bucket": bucket,
        "url": str(page.get("url") or ""),
        "last_edited": str(page.get("last_edited_time") or ""),
    }


async def list_notion_schedule_items(
    user_id: str, force_refresh: bool = False
) -> dict[str, Any]:
    saved = _load_integration(user_id)
    if not saved or not saved["token"] or not saved["config"].get("database_id"):
        return {
            "configured": False,
            "database_name": "",
            "database_url": "",
            "can_toggle": False,
            "items": [],
            "summary": {"overdue": 0, "today": 0, "upcoming": 0, "nodate": 0, "done": 0},
        }

    now_mono = time.monotonic()
    if not force_refresh and user_id in _CACHE:
        ts_mono, cached = _CACHE[user_id]
        if now_mono - ts_mono < _CACHE_TTL_SEC:
            return cached

    token = saved["token"]
    cfg = saved["config"]
    db_id = str(cfg["database_id"])
    schema = cfg.get("schema") or {}

    body: dict[str, Any] = {"page_size": 80}
    if schema.get("date"):
        body["sorts"] = [{"property": schema["date"], "direction": "ascending"}]

    timeout = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{NOTION_API_BASE}/databases/{db_id}/query",
                headers=_notion_headers(token),
                json=body,
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"拉取 Notion 日程失败: {exc}")

    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"读取 Notion 数据库失败 ({resp.status_code}): {resp.text[:200]}",
        )

    raw_results = resp.json().get("results") or []
    # Re-infer schema from first page if schema was empty
    if not schema and raw_results:
        schema = _infer_property_map(raw_results[0].get("properties") or {})

    items = [_extract_item(p, schema) for p in raw_results if p.get("object") == "page"]
    summary = {"overdue": 0, "today": 0, "upcoming": 0, "nodate": 0, "done": 0}
    for it in items:
        b = it["bucket"]
        if b in summary:
            summary[b] += 1

    # Order: overdue -> today -> upcoming -> nodate -> done
    order = {"overdue": 0, "today": 1, "upcoming": 2, "nodate": 3, "done": 4}
    items.sort(key=lambda x: (order.get(x["bucket"], 9), x["date_start"] or "9999-99-99"))

    result = {
        "configured": True,
        "database_name": str(cfg.get("database_name") or "Notion 日程"),
        "database_url": str(cfg.get("database_url") or ""),
        "can_toggle": bool(schema.get("checkbox") or schema.get("status")),
        "items": items,
        "summary": summary,
    }
    _CACHE[user_id] = (now_mono, result)
    return result


async def toggle_notion_schedule_item(
    user_id: str, page_id: str, done: bool
) -> dict[str, Any]:
    saved = _load_integration(user_id)
    if not saved or not saved["token"] or not saved["config"].get("database_id"):
        raise HTTPException(status_code=400, detail="尚未配置 Notion 日程库")

    schema = saved["config"].get("schema") or {}
    props_patch: dict[str, Any] = {}
    if schema.get("checkbox"):
        props_patch[schema["checkbox"]] = {"checkbox": bool(done)}
    elif schema.get("status"):
        s_type = schema.get("status_type") or "status"
        target_opt = schema.get("done_option") if done else schema.get("todo_option")
        if not target_opt:
            raise HTTPException(status_code=400, detail="该数据库未找到可切换的完成状态选项")
        props_patch[schema["status"]] = {s_type: {"name": target_opt}}
    else:
        raise HTTPException(status_code=400, detail="该 Notion 数据库不含复选框或状态列，暂不支持直接勾选")

    timeout = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.patch(
                f"{NOTION_API_BASE}/pages/{page_id}",
                headers=_notion_headers(saved["token"]),
                json={"properties": props_patch},
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"更新 Notion 失败: {exc}")

    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"回写 Notion 状态失败 ({resp.status_code}): {resp.text[:200]}",
        )
    _CACHE.pop(user_id, None)
    return {"ok": True, "item": _extract_item(resp.json(), schema)}


async def create_notion_schedule_item(
    user_id: str, title: str, date_start: Optional[str] = None
) -> dict[str, Any]:
    saved = _load_integration(user_id)
    if not saved or not saved["token"] or not saved["config"].get("database_id"):
        raise HTTPException(status_code=400, detail="尚未配置 Notion 日程库")

    clean_title = title.strip()
    if not clean_title:
        raise HTTPException(status_code=400, detail="请填写日程标题")

    cfg = saved["config"]
    schema = cfg.get("schema") or {}
    title_col = schema.get("title") or "Name"
    props: dict[str, Any] = {
        title_col: {"title": [{"text": {"content": clean_title}}]}
    }
    if date_start and date_start.strip() and schema.get("date"):
        props[schema["date"]] = {"date": {"start": date_start.strip()}}

    timeout = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{NOTION_API_BASE}/pages",
                headers=_notion_headers(saved["token"]),
                json={"parent": {"database_id": cfg["database_id"]}, "properties": props},
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"写入 Notion 日程失败: {exc}")

    if resp.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"新增 Notion 日程失败 ({resp.status_code}): {resp.text[:200]}",
        )
    _CACHE.pop(user_id, None)
    return {"ok": True, "item": _extract_item(resp.json(), schema)}
