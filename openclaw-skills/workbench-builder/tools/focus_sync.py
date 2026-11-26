#!/home/donut/.openclaw/tools-venv/bin/python
"""
Donut Workbench Focus Sync CLI
Direct local synchronization tool for `vault/workbench/focus.json`.
Strictly scoped to the current user's isolated OpenClaw workspace vault.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any

VALID_URGENCIES = {"must", "soon", "plan"}
VALID_COLORS = {"slate", "blue", "emerald", "amber", "rose", "violet"}


def now_ms() -> int:
    return int(time.time() * 1000)


def resolve_focus_path(vault_dir: str | None) -> Path:
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
    return base / "workbench" / "focus.json"


def sanitize_url(raw: Any) -> str:
    val = str(raw or "").strip()
    if not val:
        return ""
    if val.lower().startswith(("https://", "http://", "/")):
        return val[:500]
    return ""


def normalize_item(raw: dict[str, Any], ts: int) -> dict[str, Any]:
    title = str(raw.get("title") or "").strip()
    if not title:
        raise ValueError("Item title is required")
    urgency = str(raw.get("urgency") or "plan").strip().lower()
    if urgency not in VALID_URGENCIES:
        urgency = "plan"
    tag_color = str(raw.get("tag_color") or "slate").strip().lower()
    if tag_color not in VALID_COLORS:
        tag_color = "slate"
    return {
        "id": (str(raw.get("id") or "").strip() or f"fc_{uuid.uuid4().hex[:10]}")[:64],
        "title": title[:200],
        "urgency": urgency,
        "tag": str(raw.get("tag") or "").strip()[:32],
        "tag_color": tag_color,
        "countdown": str(raw.get("countdown") or "").strip()[:48],
        "progress": str(raw.get("progress") or "").strip()[:200],
        "source_url": sanitize_url(raw.get("source_url")),
        "done": bool(raw.get("done", False)),
        "created_at": int(raw.get("created_at") or ts),
        "updated_at": int(raw.get("updated_at") or ts),
    }


def load_doc(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "updated_at": now_ms(), "external_links": [], "items": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {"version": 1, "updated_at": now_ms(), "external_links": [], "items": []}
    return {
        "version": 1,
        "updated_at": int(data.get("updated_at") or now_ms()),
        "external_links": list(data.get("external_links") or []),
        "items": list(data.get("items") or []),
    }


def save_doc(path: Path, doc: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc["version"] = 1
    doc["updated_at"] = now_ms()
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(str(tmp), str(path))


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Donut Workbench Today's Focus (focus.json)")
    parser.add_argument("--vault-dir", help="Override vault directory path (defaults to ./vault)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="Print current focus.json as JSON")

    p_rep = sub.add_parser("replace", help="Replace all focus items from JSON string or file")
    p_rep.add_argument("--file", help="Path to JSON file containing list of items or {items, external_links}")
    p_rep.add_argument("--json", help="Inline JSON string of items list or {items, external_links}")
    p_rep.add_argument("--keep-done", action="store_true", help="Keep existing completed items")

    p_add = sub.add_parser("add", help="Add a focus item")
    p_add.add_argument("--title", required=True)
    p_add.add_argument("--urgency", default="plan", choices=["must", "soon", "plan"])
    p_add.add_argument("--tag", default="")
    p_add.add_argument("--tag-color", default="slate", choices=sorted(VALID_COLORS))
    p_add.add_argument("--countdown", default="")
    p_add.add_argument("--progress", default="")
    p_add.add_argument("--source-url", default="")

    p_upd = sub.add_parser("update", help="Update an existing focus item by id")
    p_upd.add_argument("id")
    p_upd.add_argument("--title")
    p_upd.add_argument("--urgency", choices=["must", "soon", "plan"])
    p_upd.add_argument("--tag")
    p_upd.add_argument("--tag-color", choices=sorted(VALID_COLORS))
    p_upd.add_argument("--countdown")
    p_upd.add_argument("--progress")
    p_upd.add_argument("--source-url")
    p_upd.add_argument("--done", choices=["true", "false"])

    p_done = sub.add_parser("done", help="Mark a focus item done or undone")
    p_done.add_argument("id")
    p_done.add_argument("--undo", action="store_true")

    sub.add_parser("clear-done", help="Remove all completed focus items")

    p_links = sub.add_parser("set-links", help="Configure external quick-access links")
    p_links.add_argument("--json", required=True, help='JSON array of {"label": "...", "url": "https://..."}')

    args = parser.parse_args()
    focus_path = resolve_focus_path(args.vault_dir)
    doc = load_doc(focus_path)
    ts = now_ms()

    if args.cmd == "list":
        print(json.dumps(doc, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "replace":
        raw_text = ""
        if args.file:
            raw_text = Path(args.file).read_text(encoding="utf-8")
        elif args.json:
            raw_text = args.json
        else:
            raw_text = sys.stdin.read()
        payload = json.loads(raw_text)
        if isinstance(payload, list):
            raw_items = payload
            new_links = None
        elif isinstance(payload, dict):
            raw_items = list(payload.get("items") or [])
            new_links = payload.get("external_links")
        else:
            raise SystemExit("Invalid JSON payload for replace")
        items = [normalize_item(x, ts) for x in raw_items if isinstance(x, dict)]
        if args.keep_done:
            seen_ids = {x["id"] for x in items}
            for old in doc["items"]:
                if old.get("done") and old.get("id") not in seen_ids:
                    items.append(old)
        doc["items"] = items
        if isinstance(new_links, list):
            doc["external_links"] = [
                {
                    "id": str(l.get("id") or f"lnk_{uuid.uuid4().hex[:8]}")[:48],
                    "label": str(l.get("label") or "").strip()[:40],
                    "url": sanitize_url(l.get("url")),
                }
                for l in new_links
                if isinstance(l, dict) and str(l.get("label") or "").strip() and sanitize_url(l.get("url"))
            ][:8]
        save_doc(focus_path, doc)
        print(json.dumps({"ok": True, "count": len(doc["items"]), "path": str(focus_path)}, ensure_ascii=False))
        return 0

    if args.cmd == "add":
        item = normalize_item(
            {
                "title": args.title,
                "urgency": args.urgency,
                "tag": args.tag,
                "tag_color": args.tag_color,
                "countdown": args.countdown,
                "progress": args.progress,
                "source_url": args.source_url,
            },
            ts,
        )
        doc["items"].insert(0, item)
        save_doc(focus_path, doc)
        print(json.dumps({"ok": True, "item": item}, ensure_ascii=False))
        return 0

    if args.cmd == "update":
        for idx, cur in enumerate(doc["items"]):
            if cur.get("id") == args.id:
                merged = dict(cur)
                for key in ("title", "urgency", "tag", "tag_color", "countdown", "progress", "source_url"):
                    val = getattr(args, key)
                    if val is not None:
                        merged[key] = val
                if args.done is not None:
                    merged["done"] = args.done == "true"
                merged["updated_at"] = ts
                doc["items"][idx] = normalize_item(merged, ts)
                save_doc(focus_path, doc)
                print(json.dumps({"ok": True, "item": doc["items"][idx]}, ensure_ascii=False))
                return 0
        raise SystemExit(f"Focus item not found: {args.id}")

    if args.cmd == "done":
        for cur in doc["items"]:
            if cur.get("id") == args.id:
                cur["done"] = not args.undo
                cur["updated_at"] = ts
                save_doc(focus_path, doc)
                print(json.dumps({"ok": True, "id": args.id, "done": cur["done"]}, ensure_ascii=False))
                return 0
        raise SystemExit(f"Focus item not found: {args.id}")

    if args.cmd == "clear-done":
        before = len(doc["items"])
        doc["items"] = [x for x in doc["items"] if not x.get("done")]
        save_doc(focus_path, doc)
        print(json.dumps({"ok": True, "removed": before - len(doc["items"])}, ensure_ascii=False))
        return 0

    if args.cmd == "set-links":
        raw_links = json.loads(args.json)
        links = []
        for l in raw_links:
            if isinstance(l, dict):
                label = str(l.get("label") or "").strip()[:40]
                url = sanitize_url(l.get("url"))
                if label and url:
                    links.append(
                        {
                            "id": str(l.get("id") or f"lnk_{uuid.uuid4().hex[:8]}")[:48],
                            "label": label,
                            "url": url,
                        }
                    )
        doc["external_links"] = links[:8]
        save_doc(focus_path, doc)
        print(json.dumps({"ok": True, "external_links": doc["external_links"]}, ensure_ascii=False))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
