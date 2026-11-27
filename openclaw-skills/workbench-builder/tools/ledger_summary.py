#!/home/donut/.openclaw/tools-venv/bin/python
"""
Donut Workbench Ledger Summary CLI (read-only)
Prints a compact JSON summary of the current user's `vault/workbench/ledger.db`; stdlib only.
"""
from __future__ import annotations

import argparse
import calendar
import json
import sqlite3
from datetime import date
from pathlib import Path
from typing import Any

LEAK_MIN_COUNT, LEAK_MAX_AVG, DEFAULT_TOP = 3, 60.0, 5

def resolve_vault_dir(vault_dir: str | None) -> Path | None:
    if vault_dir:
        return Path(vault_dir).expanduser().resolve()
    script_vault = Path(__file__).resolve().parent.parent / "vault"
    cwd_vault = Path.cwd() / "vault"
    if script_vault.exists():
        return script_vault
    if cwd_vault.exists():
        return cwd_vault
    return None

def _bucket_totals(rows: list[tuple[str, float]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}
    for name, amount in rows:
        slot = buckets.setdefault(name, {"name": name, "total": 0.0, "count": 0})
        slot["total"] += amount
        slot["count"] += 1
    return sorted(buckets.values(), key=lambda b: -b["total"])

def summarize(conn: sqlite3.Connection, month: str, top: int) -> dict[str, Any]:
    rows = conn.execute(
        "SELECT occurred_date, amount, category, merchant, note FROM ledger_entries WHERE month = ?"
        " ORDER BY occurred_date DESC, created_at DESC",
        (month,),
    ).fetchall()
    stored = dict(conn.execute("SELECT key, value FROM ledger_settings"))
    try:
        budget = float(stored.get("monthly_budget") or 0)
    except ValueError:
        budget = 0.0
    total = round(sum(r[1] for r in rows), 2)
    today = date.today()
    days_in = calendar.monthrange(int(month[:4]), int(month[5:7]))[1]
    elapsed = today.day if month == today.strftime("%Y-%m") else (days_in if month < today.strftime("%Y-%m") else 0)
    categories = [{**b, "total": round(b["total"], 2), "pct": round(b["total"] / total * 100, 1) if total else 0.0}
                  for b in _bucket_totals([(r[2], r[1]) for r in rows])]
    leaks = [
        {**bucket, "total": round(bucket["total"], 2), "avg": round(bucket["total"] / bucket["count"], 2)}
        for bucket in categories
        if bucket["count"] >= LEAK_MIN_COUNT and bucket["total"] / bucket["count"] <= LEAK_MAX_AVG
    ]
    return {
        "ok": True, "month": month, "total": total, "count": len(rows),
        "daily_avg": round(total / elapsed, 2) if elapsed else 0.0,
        "budget": budget, "budget_remaining": round(budget - total, 2) if budget > 0 else 0.0,
        "categories": categories, "hidden_leaks": leaks,
        "top_expenses": [
            {"date": r[0], "amount": r[1], "category": r[2], "merchant": r[3]} for r in sorted(rows, key=lambda r: -r[1])[:top]
        ],
    }

def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only monthly spending summary of the Workbench ledger (随手记账)")
    parser.add_argument("--month", help="Month to summarize as YYYY-MM (default: latest month with entries)")
    parser.add_argument("--top", type=int, default=DEFAULT_TOP, help="Number of top expenses to include (default 5)")
    parser.add_argument("--vault-dir", help="Override vault directory path (defaults to this skill's ./vault)")
    args = parser.parse_args()
    vault = resolve_vault_dir(args.vault_dir)
    db_path = vault / "workbench" / "ledger.db" if vault else None

    try:
        if db_path is None:
            raise SystemExit("Cannot locate workspace vault directory; pass --vault-dir explicitly")
        if not db_path.exists():
            print(json.dumps({"ok": False, "error": "账本尚未创建（还没有任何记账数据）"}, ensure_ascii=False))
            return 0
        conn = sqlite3.connect(f"{db_path.as_uri()}?mode=ro", uri=True, timeout=3)
        try:
            months = [r[0] for r in conn.execute("SELECT DISTINCT month FROM ledger_entries ORDER BY month DESC")]
            month = args.month or (months[0] if months else date.today().strftime("%Y-%m"))
            summary = summarize(conn, month, max(1, min(args.top, 20)))
        finally:
            conn.close()
    except sqlite3.Error as exc:
        print(json.dumps({"ok": False, "error": f"读取账本失败：{exc}"}, ensure_ascii=False))
        return 1
    summary["available_months"] = months
    print(json.dumps(summary, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
