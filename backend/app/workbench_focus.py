from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .config import VAULT_DIR
from .db import now_ms

URGENCY_ORDER = {"must": 0, "soon": 1, "plan": 2}
VALID_URGENCIES = set(URGENCY_LEVELS := ("must", "soon", "plan"))
VALID_TAG_COLORS = {"slate", "blue", "emerald", "amber", "rose", "violet"}


def get_workbench_dir(user_id: str) -> Path:
    root = VAULT_DIR / user_id / "workbench"
    root.mkdir(parents=True, exist_ok=True)
    return root


def get_focus_file_path(user_id: str) -> Path:
    return get_workbench_dir(user_id) / "focus.json"


def _sanitize_url(raw: Any) -> str:
    val = str(raw or "").strip()
    if not val:
        return ""
    low = val.lower()
    if low.startswith(("https://", "http://", "/")):
        return val[:500]
    return ""


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(str(tmp), str(path))


def _normalize_item(raw: Any, fallback_ts: int) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    title = str(raw.get("title") or "").strip()
    if not title:
        return None
    urgency = str(raw.get("urgency") or "plan").strip().lower()
    if urgency not in VALID_URGENCIES:
        urgency = "plan"
    tag_color = str(raw.get("tag_color") or "slate").strip().lower()
    if tag_color not in VALID_TAG_COLORS:
        tag_color = "slate"
    item_id = str(raw.get("id") or "").strip() or f"fc_{uuid.uuid4().hex[:10]}"
    created_at = int(raw.get("created_at") or fallback_ts)
    updated_at = int(raw.get("updated_at") or created_at)
    return {
        "id": item_id[:64],
        "title": title[:200],
        "urgency": urgency,
        "tag": str(raw.get("tag") or "").strip()[:32],
        "tag_color": tag_color,
        "countdown": str(raw.get("countdown") or "").strip()[:48],
        "progress": str(raw.get("progress") or "").strip()[:200],
        "source_url": _sanitize_url(raw.get("source_url")),
        "done": bool(raw.get("done", False)),
        "created_at": created_at,
        "updated_at": updated_at,
    }


def _normalize_link(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    label = str(raw.get("label") or "").strip()
    url = _sanitize_url(raw.get("url"))
    if not label or not url:
        return None
    link_id = str(raw.get("id") or "").strip() or f"lnk_{uuid.uuid4().hex[:8]}"
    return {
        "id": link_id[:48],
        "label": label[:40],
        "url": url,
    }


def _load_raw_focus(user_id: str) -> dict[str, Any]:
    path = get_focus_file_path(user_id)
    ts = now_ms()
    if not path.exists():
        return {"version": 1, "updated_at": ts, "external_links": [], "items": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("Focus root must be dict")
    except Exception:
        return {"version": 1, "updated_at": ts, "external_links": [], "items": []}

    raw_items = data.get("items") if isinstance(data.get("items"), list) else []
    raw_links = data.get("external_links") if isinstance(data.get("external_links"), list) else []

    items: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for r in raw_items:
        norm = _normalize_item(r, ts)
        if norm and norm["id"] not in seen_ids:
            seen_ids.add(norm["id"])
            items.append(norm)

    links: list[dict[str, Any]] = []
    seen_link_ids: set[str] = set()
    for l in raw_links:
        norm_l = _normalize_link(l)
        if norm_l and norm_l["id"] not in seen_link_ids:
            seen_link_ids.add(norm_l["id"])
            links.append(norm_l)

    return {
        "version": 1,
        "updated_at": int(data.get("updated_at") or ts),
        "external_links": links,
        "items": items,
    }


def _build_focus_response(doc: dict[str, Any]) -> dict[str, Any]:
    items = sorted(
        doc["items"],
        key=lambda x: (
            1 if x["done"] else 0,
            URGENCY_ORDER.get(x["urgency"], 2),
            -int(x.get("updated_at") or 0),
        ),
    )
    total = len(items)
    done_cnt = sum(1 for x in items if x["done"])
    active = [x for x in items if not x["done"]]
    return {
        "updated_at": doc["updated_at"],
        "external_links": doc["external_links"],
        "items": items,
        "summary": {
            "total": total,
            "done": done_cnt,
            "remaining": len(active),
            "must": sum(1 for x in active if x["urgency"] == "must"),
            "soon": sum(1 for x in active if x["urgency"] == "soon"),
            "plan": sum(1 for x in active if x["urgency"] == "plan"),
        },
    }


def get_focus_state(user_id: str) -> dict[str, Any]:
    return _build_focus_response(_load_raw_focus(user_id))


def replace_focus_state(
    user_id: str,
    items: list[dict[str, Any]],
    external_links: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    existing = _load_raw_focus(user_id)
    ts = now_ms()
    norm_items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in items:
        norm = _normalize_item(raw, ts)
        if norm and norm["id"] not in seen:
            seen.add(norm["id"])
            norm_items.append(norm)

    if external_links is None:
        links = existing["external_links"]
    else:
        links = [nl for l in external_links if (nl := _normalize_link(l)) is not None]

    doc = {
        "version": 1,
        "updated_at": ts,
        "external_links": links,
        "items": norm_items,
    }
    _atomic_write_json(get_focus_file_path(user_id), doc)
    return _build_focus_response(doc)


def add_focus_item(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    doc = _load_raw_focus(user_id)
    ts = now_ms()
    norm = _normalize_item({**payload, "created_at": ts, "updated_at": ts}, ts)
    if not norm:
        raise HTTPException(status_code=400, detail="请填写焦点事项标题")
    doc["items"].insert(0, norm)
    doc["updated_at"] = ts
    _atomic_write_json(get_focus_file_path(user_id), doc)
    return {"ok": True, "item": norm, "focus": _build_focus_response(doc)}


def update_focus_item(
    user_id: str, item_id: str, patch: dict[str, Any]
) -> dict[str, Any]:
    doc = _load_raw_focus(user_id)
    ts = now_ms()
    target_idx = next((i for i, x in enumerate(doc["items"]) if x["id"] == item_id), -1)
    if target_idx < 0:
        raise HTTPException(status_code=404, detail="未找到该焦点事项")

    merged = {**doc["items"][target_idx], **patch, "id": item_id, "updated_at": ts}
    norm = _normalize_item(merged, ts)
    if not norm:
        raise HTTPException(status_code=400, detail="标题不能为空")
    doc["items"][target_idx] = norm
    doc["updated_at"] = ts
    _atomic_write_json(get_focus_file_path(user_id), doc)
    return {"ok": True, "item": norm, "focus": _build_focus_response(doc)}


def delete_focus_item(user_id: str, item_id: str) -> dict[str, Any]:
    doc = _load_raw_focus(user_id)
    next_items = [x for x in doc["items"] if x["id"] != item_id]
    if len(next_items) == len(doc["items"]):
        raise HTTPException(status_code=404, detail="未找到该焦点事项")
    doc["items"] = next_items
    doc["updated_at"] = now_ms()
    _atomic_write_json(get_focus_file_path(user_id), doc)
    return {"ok": True, "focus": _build_focus_response(doc)}


def clear_done_focus_items(user_id: str) -> dict[str, Any]:
    doc = _load_raw_focus(user_id)
    doc["items"] = [x for x in doc["items"] if not x["done"]]
    doc["updated_at"] = now_ms()
    _atomic_write_json(get_focus_file_path(user_id), doc)
    return {"ok": True, "focus": _build_focus_response(doc)}


def update_focus_links(
    user_id: str, external_links: list[dict[str, Any]]
) -> dict[str, Any]:
    doc = _load_raw_focus(user_id)
    links: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in external_links:
        norm = _normalize_link(raw)
        if norm and norm["id"] not in seen:
            seen.add(norm["id"])
            links.append(norm)
    doc["external_links"] = links[:8]
    doc["updated_at"] = now_ms()
    _atomic_write_json(get_focus_file_path(user_id), doc)
    return {"ok": True, "focus": _build_focus_response(doc)}
