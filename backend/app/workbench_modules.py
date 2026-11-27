from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from .config import VAULT_DIR
from .db import now_ms

RESERVED_MODULE_IDS = {
    "focus",
    "cron",
    "manage",
    "modules",
    "reimbursements",
    "apps",
    "schedule",
}
APP_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")

CORE_MODULES = [
    {
        "id": "focus",
        "kind": "core",
        "name": "今日焦点",
        "description": "零外部依赖的每日焦点清单，支持紧急层级、进展摘要与 OpenClaw 同步",
        "icon": "focus",
        "enabled": True,
        "removable": False,
    },
    {
        "id": "cron",
        "kind": "core",
        "name": "定时任务",
        "description": "管理 OpenClaw 自动巡检、提醒与定时调度任务",
        "icon": "clock",
        "enabled": True,
        "removable": False,
    },
]

BUILTIN_PLUGINS = [
    {
        "id": "reimbursements",
        "kind": "builtin",
        "name": "报销台账",
        "description": "本地报销流水整理、三单核对与发票原件 ZIP 打包",
        "icon": "receipt",
        "default_users": {"bear"},
        "removable": False,
    },
    {
        "id": "ledger",
        "kind": "builtin",
        "name": "随手记账",
        "description": "零外发离线记账、微信/支付宝账单导入与月度消费洞察",
        "icon": "wallet",
        "default_users": {"bear", "her"},
        "removable": False,
    },
]


def _get_modules_config_path(user_id: str) -> Path:
    root = VAULT_DIR / user_id / "workbench"
    root.mkdir(parents=True, exist_ok=True)
    return root / "modules.json"


def _get_apps_root(user_id: str) -> Path:
    root = VAULT_DIR / user_id / "workbench" / "apps"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _load_modules_config(user_id: str) -> dict[str, Any]:
    path = _get_modules_config_path(user_id)
    if not path.exists():
        return {"version": 1, "order": [], "enabled": {}, "updated_at": 0}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("Invalid modules.json")
        order = [str(x) for x in (data.get("order") or []) if isinstance(x, str)]
        raw_enabled = data.get("enabled") if isinstance(data.get("enabled"), dict) else {}
        enabled = {str(k): bool(v) for k, v in raw_enabled.items()}
        return {
            "version": 1,
            "order": order,
            "enabled": enabled,
            "updated_at": int(data.get("updated_at") or 0),
        }
    except Exception:
        return {"version": 1, "order": [], "enabled": {}, "updated_at": 0}


def _save_modules_config(
    user_id: str, order: list[str], enabled: dict[str, bool]
) -> None:
    path = _get_modules_config_path(user_id)
    payload = {
        "version": 1,
        "order": order,
        "enabled": enabled,
        "updated_at": now_ms(),
    }
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(str(tmp), str(path))


def parse_app_manifest(app_dir: Path, app_id: str) -> dict[str, Any] | None:
    if app_id in RESERVED_MODULE_IDS or not APP_ID_RE.fullmatch(app_id):
        return None
    if not app_dir.is_dir() or app_dir.is_symlink():
        return None
    manifest_path = app_dir / "manifest.json"
    if not manifest_path.is_file() or manifest_path.is_symlink():
        return None
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
    except Exception:
        return None

    entry = str(raw.get("entry") or "index.html").strip() or "index.html"
    data_file = str(raw.get("data_file") or "data.json").strip() or "data.json"
    has_html = (app_dir / entry).is_file() and not (app_dir / entry).is_symlink()
    template = str(raw.get("template") or "").strip().lower()
    engine = str(raw.get("engine") or "").strip().lower()
    if engine not in ("template", "html"):
        engine = (
            "template"
            if template in ("checklist", "table", "cards", "markdown")
            else ("html" if has_html else "template")
        )
    if engine == "template" and template not in ("checklist", "table", "cards", "markdown"):
        template = "checklist"

    return {
        "id": app_id,
        "kind": engine,
        "template": template if engine == "template" else None,
        "name": str(raw.get("name") or app_id).strip()[:40] or app_id,
        "description": str(raw.get("description") or "").strip()[:160],
        "icon": str(raw.get("icon") or ("code" if engine == "html" else "puzzle")).strip()[:32],
        "entry": entry,
        "data_file": data_file,
        "removable": True,
        "default_enabled": bool(raw.get("enabled", True)),
    }


def _scan_micro_app_manifests(user_id: str) -> list[dict[str, Any]]:
    apps_root = _get_apps_root(user_id).resolve()
    discovered: list[dict[str, Any]] = []
    for child in sorted(apps_root.iterdir(), key=lambda p: p.name.lower()):
        parsed = parse_app_manifest(child, child.name)
        if parsed:
            discovered.append(parsed)
    return discovered


def list_workbench_modules(user_id: str) -> dict[str, Any]:
    cfg = _load_modules_config(user_id)
    order_index = {mid: idx for idx, mid in enumerate(cfg["order"])}
    enabled_map = cfg["enabled"]

    candidates: list[dict[str, Any]] = []
    for plugin in BUILTIN_PLUGINS:
        pid = plugin["id"]
        is_enabled = enabled_map[pid] if pid in enabled_map else (user_id in plugin["default_users"])
        candidates.append(
            {
                "id": pid,
                "kind": plugin["kind"],
                "template": None,
                "name": plugin["name"],
                "description": plugin["description"],
                "icon": plugin["icon"],
                "enabled": bool(is_enabled),
                "removable": False,
                "_sort": (0, order_index[pid]) if pid in order_index else (1, 0),
            }
        )

    for app in _scan_micro_app_manifests(user_id):
        aid = app["id"]
        is_enabled = enabled_map[aid] if aid in enabled_map else app["default_enabled"]
        candidates.append(
            {
                "id": aid,
                "kind": app["kind"],
                "template": app["template"],
                "name": app["name"],
                "description": app["description"],
                "icon": app["icon"],
                "enabled": bool(is_enabled),
                "removable": True,
                "_sort": (0, order_index[aid]) if aid in order_index else (2, 0),
            }
        )

    candidates.sort(key=lambda m: (m["_sort"][0], m["_sort"][1], m["name"].lower()))
    modules: list[dict[str, Any]] = []
    for idx, item in enumerate(candidates):
        clean = {k: v for k, v in item.items() if k != "_sort"}
        clean["order"] = idx
        modules.append(clean)

    return {"core": CORE_MODULES, "modules": modules}


def update_workbench_modules(
    user_id: str, items: list[dict[str, Any]]
) -> dict[str, Any]:
    current = list_workbench_modules(user_id)["modules"]
    known_ids = {m["id"] for m in current}
    current_enabled = {m["id"]: bool(m["enabled"]) for m in current}

    new_order: list[str] = []
    new_enabled: dict[str, bool] = dict(current_enabled)

    for entry in items:
        mid = str(entry.get("id") or "").strip()
        if mid not in known_ids or mid in new_order:
            continue
        new_order.append(mid)
        if "enabled" in entry:
            new_enabled[mid] = bool(entry["enabled"])

    for m in current:
        if m["id"] not in new_order:
            new_order.append(m["id"])

    _save_modules_config(user_id, new_order, new_enabled)
    return list_workbench_modules(user_id)


def remove_module_from_config(user_id: str, module_id: str) -> None:
    cfg = _load_modules_config(user_id)
    order = [m for m in cfg["order"] if m != module_id]
    enabled = {k: v for k, v in cfg["enabled"].items() if k != module_id}
    _save_modules_config(user_id, order, enabled)
