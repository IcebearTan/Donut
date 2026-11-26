from __future__ import annotations

import datetime
import json
import os
import shutil
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .config import VAULT_DIR
from .workbench_modules import (
    APP_ID_RE,
    RESERVED_MODULE_IDS,
    parse_app_manifest,
    remove_module_from_config,
)

TZ_CN = datetime.timezone(datetime.timedelta(hours=8))
MAX_APP_PAYLOAD_BYTES = 512 * 1024


def _get_apps_root(user_id: str) -> Path:
    root = VAULT_DIR / user_id / "workbench" / "apps"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _resolve_app_dir(user_id: str, app_id: str) -> tuple[Path, dict[str, Any]]:
    clean_id = (app_id or "").strip()
    if clean_id in RESERVED_MODULE_IDS or not APP_ID_RE.fullmatch(clean_id):
        raise HTTPException(status_code=400, detail="非法的微应用 ID")
    apps_root = _get_apps_root(user_id).resolve()
    app_dir = apps_root / clean_id
    if not app_dir.exists() or app_dir.is_symlink() or not app_dir.is_dir():
        raise HTTPException(status_code=404, detail="微应用不存在")
    try:
        app_dir.resolve().relative_to(apps_root)
    except ValueError:
        raise HTTPException(status_code=403, detail="越权访问微应用目录")

    manifest = parse_app_manifest(app_dir, clean_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="微应用缺少有效的 manifest.json")
    return app_dir, manifest


def _resolve_contained_file(app_dir: Path, rel_name: str) -> Path:
    clean = (rel_name or "").strip()
    if not clean or "/" in clean or "\\" in clean or ".." in clean or clean.startswith("."):
        raise HTTPException(status_code=400, detail="非法的微应用文件名")
    target = app_dir / clean
    if target.is_symlink():
        raise HTTPException(status_code=403, detail="禁止访问软链接文件")
    try:
        target.resolve().relative_to(app_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="非法路径越界")
    return target


def _atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    raw = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if len(raw.encode("utf-8")) > MAX_APP_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="微应用数据超过 512KB 上限")
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(raw, encoding="utf-8")
    os.replace(str(tmp), str(path))


def _default_data_for_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    tpl = manifest.get("template")
    if tpl == "checklist":
        return {
            "subtitle": manifest.get("description") or "",
            "reset_mode": "daily",
            "last_reset_date": datetime.datetime.now(TZ_CN).strftime("%Y-%m-%d"),
            "streak_days": 0,
            "items": [],
        }
    if tpl == "table":
        return {"columns": [], "rows": []}
    if tpl == "cards":
        return {"categories": ["全部"], "cards": []}
    if tpl == "markdown":
        return {"title": manifest.get("name") or "", "content": ""}
    return {}


def _maybe_reset_daily_checklist(
    manifest: dict[str, Any], data: dict[str, Any], data_path: Path
) -> dict[str, Any]:
    if manifest.get("template") != "checklist":
        return data
    if str(data.get("reset_mode") or "").lower() != "daily":
        return data

    now_dt = datetime.datetime.now(TZ_CN)
    today = now_dt.strftime("%Y-%m-%d")
    yesterday = (now_dt.date() - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    last_date = str(data.get("last_reset_date") or "").strip()

    if not last_date:
        data["last_reset_date"] = today
        _atomic_write_json(data_path, data)
        return data
    if last_date == today:
        return data

    items = data.get("items") if isinstance(data.get("items"), list) else []
    done_cnt = sum(1 for it in items if isinstance(it, dict) and it.get("done"))
    total_cnt = len(items)

    history = data.get("history") if isinstance(data.get("history"), dict) else {}
    history[last_date] = {"done": done_cnt, "total": total_cnt}
    trimmed_keys = sorted(history.keys())[-30:]
    data["history"] = {k: history[k] for k in trimmed_keys}

    prev_streak = int(data.get("streak_days") or 0)
    if last_date == yesterday and done_cnt > 0:
        data["streak_days"] = prev_streak + 1
    elif last_date < yesterday:
        data["streak_days"] = 0

    for it in items:
        if isinstance(it, dict):
            it["done"] = False
            it["done_at"] = None
    data["last_reset_date"] = today
    _atomic_write_json(data_path, data)
    return data


def _read_app_data_internal(app_dir: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    data_path = _resolve_contained_file(app_dir, manifest["data_file"])
    if data_path.exists() and data_path.is_file():
        try:
            loaded = json.loads(data_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                return _maybe_reset_daily_checklist(manifest, loaded, data_path)
        except Exception:
            pass

    if manifest.get("template") == "markdown":
        for md_name in ("content.md", "README.md"):
            md_path = app_dir / md_name
            if md_path.is_file() and not md_path.is_symlink():
                return {
                    "title": manifest["name"],
                    "content": md_path.read_text(encoding="utf-8", errors="replace"),
                }

    return _default_data_for_manifest(manifest)


def get_user_app_detail(user_id: str, app_id: str) -> dict[str, Any]:
    app_dir, manifest = _resolve_app_dir(user_id, app_id)
    data = _read_app_data_internal(app_dir, manifest)
    public_app = {k: v for k, v in manifest.items() if k not in ("entry", "data_file")}
    return {"app": public_app, "data": data}


def get_user_app_data(user_id: str, app_id: str) -> dict[str, Any]:
    app_dir, manifest = _resolve_app_dir(user_id, app_id)
    return {"data": _read_app_data_internal(app_dir, manifest)}


def save_user_app_data(
    user_id: str, app_id: str, data: dict[str, Any]
) -> dict[str, Any]:
    app_dir, manifest = _resolve_app_dir(user_id, app_id)
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="微应用数据必须是 JSON 对象")
    data_path = _resolve_contained_file(app_dir, manifest["data_file"])
    _atomic_write_json(data_path, data)
    return {"ok": True, "data": data}


def get_user_app_html(user_id: str, app_id: str) -> dict[str, Any]:
    app_dir, manifest = _resolve_app_dir(user_id, app_id)
    if manifest["kind"] != "html":
        raise HTTPException(status_code=400, detail="该微应用不是 HTML 沙箱模式")
    entry_path = _resolve_contained_file(app_dir, manifest["entry"])
    if not entry_path.exists() or not entry_path.is_file():
        raise HTTPException(status_code=404, detail="微应用入口 HTML 文件不存在")
    raw_bytes = entry_path.read_bytes()
    if len(raw_bytes) > MAX_APP_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="HTML 微应用文件过大")
    html = raw_bytes.decode("utf-8", errors="replace")
    data = _read_app_data_internal(app_dir, manifest)
    public_app = {k: v for k, v in manifest.items() if k not in ("entry", "data_file")}
    return {"app": public_app, "html": html, "data": data}


def delete_user_app(user_id: str, app_id: str) -> dict[str, Any]:
    app_dir, _manifest = _resolve_app_dir(user_id, app_id)
    shutil.rmtree(app_dir, ignore_errors=False)
    remove_module_from_config(user_id, app_id)
    return {"ok": True}
