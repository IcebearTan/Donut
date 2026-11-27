#!/home/donut/.openclaw/tools-venv/bin/python
"""
Donut Workbench Micro-App Builder CLI
Create, validate, and update per-user micro-apps in `vault/workbench/apps/<app-id>/`.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any

RESERVED_IDS = {"focus", "cron", "manage", "modules", "reimbursements", "ledger", "apps", "schedule"}
APP_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")
VALID_TEMPLATES = {"checklist", "table", "cards", "markdown"}


def resolve_apps_root(vault_dir: str | None) -> Path:
    if vault_dir:
        base = Path(vault_dir).expanduser().resolve()
    else:
        script_vault = Path(__file__).resolve().parent.parent / "vault"
        cwd_vault = Path.cwd() / "vault"
        if script_vault.exists():
            base = script_vault
        elif cwd_vault.exists():
            base = cwd_vault
        else:
            raise SystemExit("Cannot locate workspace vault directory; pass --vault-dir explicitly")
    apps = base / "workbench" / "apps"
    apps.mkdir(parents=True, exist_ok=True)
    return apps


def validate_app_id(app_id: str) -> str:
    clean = app_id.strip()
    if clean in RESERVED_IDS or not APP_ID_RE.fullmatch(clean):
        raise SystemExit(f"Invalid or reserved app_id: {app_id}")
    return clean


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(str(tmp), str(path))


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage Donut Workbench micro-apps in vault/workbench/apps/")
    parser.add_argument("--vault-dir", help="Override vault directory path")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="List micro-apps in current user's workbench")

    p_tpl = sub.add_parser("create-template", help="Create or update a declarative template micro-app")
    p_tpl.add_argument("app_id")
    p_tpl.add_argument("--name", required=True)
    p_tpl.add_argument("--template", required=True, choices=sorted(VALID_TEMPLATES))
    p_tpl.add_argument("--description", default="")
    p_tpl.add_argument("--icon", default="puzzle")
    p_tpl.add_argument("--data-json", help="Inline JSON string for initial data.json")
    p_tpl.add_argument("--data-file", help="Path to JSON file for initial data.json")

    p_html = sub.add_parser("create-html", help="Create or update a sandboxed HTML micro-app")
    p_html.add_argument("app_id")
    p_html.add_argument("--name", required=True)
    p_html.add_argument("--description", default="")
    p_html.add_argument("--icon", default="code")
    p_html.add_argument("--html-file", required=True, help="Path to index.html source")
    p_html.add_argument("--data-json", default="{}", help="Inline JSON object for initial data.json")

    p_data = sub.add_parser("set-data", help="Update data.json for an existing micro-app")
    p_data.add_argument("app_id")
    p_data.add_argument("--json", help="Inline JSON object")
    p_data.add_argument("--file", help="Path to JSON object file")

    args = parser.parse_args()
    apps_root = resolve_apps_root(args.vault_dir)

    if args.cmd == "list":
        out: list[dict[str, Any]] = []
        for child in sorted(apps_root.iterdir()):
            mf = child / "manifest.json"
            if child.is_dir() and mf.is_file():
                try:
                    m = json.loads(mf.read_text(encoding="utf-8"))
                    out.append({"id": child.name, **m})
                except Exception:
                    continue
        print(json.dumps({"apps": out}, ensure_ascii=False, indent=2))
        return 0

    app_id = validate_app_id(args.app_id)
    app_dir = apps_root / app_id
    app_dir.mkdir(parents=True, exist_ok=True)

    if args.cmd == "create-template":
        manifest = {
            "id": app_id,
            "name": args.name.strip()[:40],
            "description": args.description.strip()[:160],
            "icon": args.icon.strip()[:32],
            "engine": "template",
            "template": args.template,
            "data_file": "data.json",
            "schema_version": 1,
        }
        atomic_write(app_dir / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        if args.data_file:
            data = json.loads(Path(args.data_file).read_text(encoding="utf-8"))
        elif args.data_json:
            data = json.loads(args.data_json)
        else:
            data = {}
        if not isinstance(data, dict):
            raise SystemExit("data.json must be a JSON object")
        atomic_write(app_dir / "data.json", json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"ok": True, "app_dir": str(app_dir), "manifest": manifest}, ensure_ascii=False))
        return 0

    if args.cmd == "create-html":
        manifest = {
            "id": app_id,
            "name": args.name.strip()[:40],
            "description": args.description.strip()[:160],
            "icon": args.icon.strip()[:32],
            "engine": "html",
            "entry": "index.html",
            "data_file": "data.json",
            "schema_version": 1,
        }
        html_text = Path(args.html_file).read_text(encoding="utf-8")
        data = json.loads(args.data_json)
        if not isinstance(data, dict):
            raise SystemExit("data.json must be a JSON object")
        atomic_write(app_dir / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        atomic_write(app_dir / "index.html", html_text)
        atomic_write(app_dir / "data.json", json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"ok": True, "app_dir": str(app_dir), "manifest": manifest}, ensure_ascii=False))
        return 0

    if args.cmd == "set-data":
        raw = Path(args.file).read_text(encoding="utf-8") if args.file else args.json
        if not raw:
            raise SystemExit("Provide --json or --file")
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise SystemExit("data.json must be a JSON object")
        atomic_write(app_dir / "data.json", json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"ok": True, "app_id": app_id}, ensure_ascii=False))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
