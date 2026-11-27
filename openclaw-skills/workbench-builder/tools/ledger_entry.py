#!/home/donut/.openclaw/tools-venv/bin/python
"""
Donut Workbench Official Ledger CLI (`随手记账` — `vault/workbench/ledger.db`)
Stdlib-only, per-user isolated SQLite CRUD + budget tool matching Portal backend schema.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sqlite3
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

CST = timezone(timedelta(hours=8))
CATEGORIES = ("餐饮", "饮品零食", "交通", "购物", "日用", "娱乐", "学习", "医疗", "居住", "人情", "其他")
PAYMENT_METHODS = ("微信", "支付宝", "银行卡", "现金", "其他")
SCHEMA = """
CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY, occurred_date TEXT NOT NULL, month TEXT NOT NULL, amount REAL NOT NULL,
    category TEXT NOT NULL, merchant TEXT NOT NULL DEFAULT '', payment_method TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual', fingerprint TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ledger_month ON ledger_entries(month, occurred_date);
CREATE INDEX IF NOT EXISTS idx_ledger_fp ON ledger_entries(fingerprint);
CREATE TABLE IF NOT EXISTS ledger_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def now_ms() -> int:
    return int(datetime.now(CST).timestamp() * 1000)


def resolve_db(vault_dir: str | None) -> Path:
    if vault_dir:
        base = Path(vault_dir).expanduser().resolve()
    else:
        sv = Path(__file__).resolve().parent.parent / "vault"
        cv = Path.cwd() / "vault"
        base = sv if sv.exists() else (cv if cv.exists() else None)  # type: ignore[assignment]
        if base is None:
            raise SystemExit("Cannot locate workspace vault directory; pass --vault-dir explicitly")
    p = base / "workbench" / "ledger.db"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def connect(db: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db), timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        os.chmod(str(db), 0o600)
    except OSError:
        pass
    conn.executescript(SCHEMA)
    return conn


def norm_date(raw: str | None) -> str:
    if not raw:
        return datetime.now(CST).date().isoformat()
    s = raw.strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%m-%d", "%m/%d"):
        try:
            dt = datetime.strptime(s, fmt)
            if fmt in ("%m-%d", "%m/%d"):
                dt = dt.replace(year=datetime.now(CST).year)
            return dt.date().isoformat()
        except ValueError:
            continue
    raise SystemExit(f"Invalid date: {raw} (use YYYY-MM-DD)")


def make_fp(day: str, amount: float, category: str, merchant: str) -> str:
    raw = f"{day}|{amount:.2f}|{category.strip()}|{merchant.strip()}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def emit(obj: dict[str, Any], pretty: bool = False) -> int:
    print(json.dumps(obj, ensure_ascii=False, indent=2 if pretty else None, separators=None if pretty else (",", ":")))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Donut Workbench Ledger CLI (随手记账)")
    p.add_argument("--vault-dir", help="Override vault directory path")
    p.add_argument("--pretty", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_add = sub.add_parser("add", help="Add a spending entry")
    p_add.add_argument("--amount", type=float, required=True)
    p_add.add_argument("--category", default="其他", choices=CATEGORIES)
    p_add.add_argument("--date", default=None)
    p_add.add_argument("--merchant", default="")
    p_add.add_argument("--method", default="", choices=("",) + PAYMENT_METHODS)
    p_add.add_argument("--note", default="")
    p_add.add_argument("--force", action="store_true", help="Allow duplicate fingerprint")

    p_ls = sub.add_parser("list", help="List recent entries")
    p_ls.add_argument("--month", default=None, help="Filter by YYYY-MM")
    p_ls.add_argument("--limit", type=int, default=30)

    p_upd = sub.add_parser("update", help="Update an entry by id")
    p_upd.add_argument("--id", required=True)
    p_upd.add_argument("--amount", type=float)
    p_upd.add_argument("--category", choices=CATEGORIES)
    p_upd.add_argument("--date")
    p_upd.add_argument("--merchant")
    p_upd.add_argument("--method", choices=("",) + PAYMENT_METHODS)
    p_upd.add_argument("--note")

    p_del = sub.add_parser("delete", help="Delete an entry by id")
    p_del.add_argument("--id", required=True)

    p_b = sub.add_parser("set-budget", help="Set monthly budget (0 to clear)")
    p_b.add_argument("--amount", type=float, required=True)

    args = p.parse_args()
    conn = connect(resolve_db(args.vault_dir))
    try:
        if args.cmd == "list":
            limit = max(1, min(args.limit, 200))
            if args.month:
                rows = conn.execute(
                    "SELECT id, occurred_date, amount, category, merchant, payment_method, note "
                    "FROM ledger_entries WHERE month = ? ORDER BY occurred_date DESC, created_at DESC LIMIT ?",
                    (args.month, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT id, occurred_date, amount, category, merchant, payment_method, note "
                    "FROM ledger_entries ORDER BY occurred_date DESC, created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return emit({"ok": True, "count": len(rows), "items": [dict(r) for r in rows]}, args.pretty)

        if args.cmd == "add":
            amt = round(float(args.amount), 2)
            if not math.isfinite(amt) or amt <= 0:
                return emit({"ok": False, "error": "金额必须大于 0"}, args.pretty) or 1
            day = norm_date(args.date)
            merch = args.merchant.strip()[:40]
            note = args.note.strip()[:200]
            fp = make_fp(day, amt, args.category, merch)
            if not args.force:
                dup = conn.execute("SELECT id, occurred_date, amount, merchant FROM ledger_entries WHERE fingerprint = ?", (fp,)).fetchone()
                if dup:
                    return emit({"ok": False, "duplicate": True, "existing": dict(dup), "hint": "如需重复录入请加 --force"}, args.pretty) or 1
            eid = f"le_{uuid.uuid4().hex[:12]}"
            ts = now_ms()
            with conn:
                conn.execute(
                    "INSERT INTO ledger_entries (id, occurred_date, month, amount, category, merchant, payment_method, note, source, fingerprint, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)",
                    (eid, day, day[:7], amt, args.category, merch, args.method, note, fp, ts, ts),
                )
            saved = dict(conn.execute("SELECT id, occurred_date, month, amount, category, merchant, payment_method, note FROM ledger_entries WHERE id = ?", (eid,)).fetchone())
            return emit({"ok": True, "entry": saved}, args.pretty)

        if args.cmd == "update":
            cur = conn.execute("SELECT * FROM ledger_entries WHERE id = ?", (args.id,)).fetchone()
            if not cur:
                return emit({"ok": False, "error": f"账目不存在：{args.id}"}, args.pretty) or 1
            day = norm_date(args.date) if args.date is not None else cur["occurred_date"]
            amt = round(float(args.amount), 2) if args.amount is not None else float(cur["amount"])
            if not math.isfinite(amt) or amt <= 0:
                return emit({"ok": False, "error": "金额必须大于 0"}, args.pretty) or 1
            cat = args.category if args.category is not None else cur["category"]
            merch = args.merchant.strip()[:40] if args.merchant is not None else cur["merchant"]
            method = args.method if args.method is not None else cur["payment_method"]
            note = args.note.strip()[:200] if args.note is not None else cur["note"]
            fp = make_fp(day, amt, cat, merch)
            with conn:
                conn.execute(
                    "UPDATE ledger_entries SET occurred_date=?, month=?, amount=?, category=?, merchant=?, payment_method=?, note=?, fingerprint=?, updated_at=? WHERE id=?",
                    (day, day[:7], amt, cat, merch, method, note, fp, now_ms(), args.id),
                )
            saved = dict(conn.execute("SELECT id, occurred_date, month, amount, category, merchant, payment_method, note FROM ledger_entries WHERE id = ?", (args.id,)).fetchone())
            return emit({"ok": True, "entry": saved}, args.pretty)

        if args.cmd == "delete":
            with conn:
                cur = conn.execute("DELETE FROM ledger_entries WHERE id = ?", (args.id,))
            if cur.rowcount == 0:
                return emit({"ok": False, "error": f"账目不存在：{args.id}"}, args.pretty) or 1
            return emit({"ok": True, "deleted": args.id}, args.pretty)

        if args.cmd == "set-budget":
            amt = round(max(0.0, float(args.amount)), 2)
            with conn:
                conn.execute("INSERT OR REPLACE INTO ledger_settings (key, value) VALUES ('monthly_budget', ?)", (str(amt),))
            return emit({"ok": True, "monthly_budget": amt}, args.pretty)
    finally:
        conn.close()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
