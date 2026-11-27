"""随手记账 core service: per-user isolated SQLite, CRUD, analytics, CSV export, wipe.

Physical isolation: each user owns `VAULT_DIR/<user_id>/workbench/ledger.db` (chmod 0600).
Nothing here makes network calls; `strict_offline` is ON by default.
"""
from __future__ import annotations

import calendar
import csv
import io
import math
import os
import re
import sqlite3
import uuid
from contextlib import closing
from datetime import date
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException

from .config import VAULT_DIR
from .db import now_ms
from .workbench_ledger_import import CATEGORIES, PAYMENT_METHODS, strip_pii

SOURCES = ("quick", "ocr", "wechat_import", "alipay_import", "manual")
LEAK_MIN_COUNT, LEAK_MAX_AVG = 3, 60.0  # "拿铁因子": frequent (>= 3x) small (avg <= ¥60) spends
RIDE_RE = re.compile(r"滴滴|打车|出租|的士|网约|高德|出行|单车")
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

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
ENTRY_FIELDS = ("id", "occurred_date", "month", "amount", "category", "merchant", "payment_method",
                "note", "source", "fingerprint", "created_at", "updated_at")
EXPORT_COLUMNS = ("日期", "月份", "金额", "分类", "商户", "支付方式", "备注", "来源", "记录时间")

def _db_path(user_id: str) -> Path:
    root = VAULT_DIR / user_id / "workbench"
    root.mkdir(parents=True, exist_ok=True)
    return root / "ledger.db"

def _connect(user_id: str) -> sqlite3.Connection:
    path = _db_path(user_id)
    conn = sqlite3.connect(str(path), timeout=5)
    conn.row_factory = sqlite3.Row
    try:
        os.chmod(str(path), 0o600)  # best effort (no-op semantics on non-POSIX)
    except OSError:
        pass
    conn.executescript(SCHEMA)
    return conn

def _validate_month(month: Optional[str]) -> None:
    if month and not MONTH_RE.match(month):
        raise HTTPException(400, "月份格式应为 YYYY-MM")

def _normalize(raw: Any, base: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    cur = dict(base or {})
    if not isinstance(raw, dict):
        raise HTTPException(400, "账目格式不正确")
    day = str(raw.get("occurred_date", cur.get("occurred_date")) or date.today().isoformat()).strip()
    try:
        parsed = date.fromisoformat(day)
    except ValueError:
        parsed = None
    if not parsed or not DAY_RE.match(day):
        raise HTTPException(400, f"日期格式不正确：{day[:10]}")
    try:
        amount = round(float(raw.get("amount", cur.get("amount")) or 0), 2)
    except (TypeError, ValueError):
        amount = -1.0
    if not math.isfinite(amount) or amount <= 0:
        raise HTTPException(400, "金额必须大于 0")
    source = str(raw.get("source", cur.get("source") or "manual") or "manual")
    category = str(raw.get("category", cur.get("category") or "其他") or "其他")
    method = str(raw.get("payment_method", cur.get("payment_method") or "") or "")
    fingerprint = str(raw.get("fingerprint", cur.get("fingerprint") or "") or "")
    return {
        "occurred_date": day, "month": day[:7], "amount": amount,
        "category": category if category in CATEGORIES else "其他",
        "payment_method": method if method in PAYMENT_METHODS else "",
        "merchant": strip_pii(raw.get("merchant", cur.get("merchant") or ""))[:40].replace("\n", " ").strip(),
        "note": strip_pii(raw.get("note", cur.get("note") or ""))[:200].replace("\n", " ").strip(),
        "source": source if source in SOURCES else "manual",
        "fingerprint": fingerprint if re.fullmatch(r"[0-9a-f]{8,32}", fingerprint) else "",
    }

def _existing_fingerprints(conn: sqlite3.Connection, fingerprints: list[str]) -> set[str]:
    found: set[str] = set()
    wanted = sorted({f for f in fingerprints if f})
    for start in range(0, len(wanted), 500):
        chunk = wanted[start:start + 500]
        marks = ",".join("?" * len(chunk))
        found.update(r[0] for r in conn.execute(
            f"SELECT fingerprint FROM ledger_entries WHERE fingerprint IN ({marks})", chunk))
    return found

def existing_fingerprints(user_id: str, fingerprints: list[str]) -> set[str]:
    """Which of the given import fingerprints are already stored for this user (dry-run preview)."""
    with closing(_connect(user_id)) as conn:
        return _existing_fingerprints(conn, fingerprints)

def create_entries(user_id: str, items: Any) -> dict[str, Any]:
    if not isinstance(items, list) or not items:
        raise HTTPException(400, "没有可保存的账目")
    if len(items) > 5000:
        raise HTTPException(400, "单次最多保存 5000 条账目")
    rows: list[dict[str, Any]] = []
    for idx, raw in enumerate(items):
        try:
            row = _normalize(raw)
        except HTTPException as exc:
            raise HTTPException(400, f"第 {idx + 1} 条：{exc.detail}") from exc
        row["id"] = f"le_{uuid.uuid4().hex[:12]}"
        row["created_at"] = row["updated_at"] = now_ms()
        rows.append(row)
    with closing(_connect(user_id)) as conn, conn:
        known = _existing_fingerprints(conn, [r["fingerprint"] for r in rows])
        fresh: list[dict[str, Any]] = []
        for row in rows:
            fp = row["fingerprint"]
            if fp and fp in known:
                continue
            known.add(fp)
            fresh.append(row)
        conn.executemany(
            f"INSERT INTO ledger_entries ({','.join(ENTRY_FIELDS)}) VALUES ({','.join('?' * len(ENTRY_FIELDS))})",
            [tuple(r[f] for f in ENTRY_FIELDS) for r in fresh],
        )
    return {"ok": True, "inserted": [{k: r[k] for k in ENTRY_FIELDS} for r in fresh], "skipped": len(rows) - len(fresh)}

def update_entry(user_id: str, entry_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    with closing(_connect(user_id)) as conn, conn:
        cur = conn.execute("SELECT * FROM ledger_entries WHERE id = ?", (entry_id,)).fetchone()
        if not cur:
            raise HTTPException(404, "账目不存在")
        row = _normalize(patch, dict(cur))
        row["updated_at"] = now_ms()
        assignments = ",".join(f"{f} = ?" for f in ENTRY_FIELDS if f not in ("id", "created_at"))
        conn.execute(
            f"UPDATE ledger_entries SET {assignments} WHERE id = ?",
            tuple(row[f] for f in ENTRY_FIELDS if f not in ("id", "created_at")) + (entry_id,),
        )
        saved = conn.execute("SELECT * FROM ledger_entries WHERE id = ?", (entry_id,)).fetchone()
    return {k: saved[k] for k in ENTRY_FIELDS}

def delete_entry(user_id: str, entry_id: str) -> dict[str, Any]:
    with closing(_connect(user_id)) as conn, conn:
        cur = conn.execute("DELETE FROM ledger_entries WHERE id = ?", (entry_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, "账目不存在")
    return {"ok": True, "id": entry_id}

def _read_settings(conn: sqlite3.Connection) -> dict[str, Any]:
    stored = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM ledger_settings")}
    try:
        budget = float(stored.get("monthly_budget", 0) or 0)
    except (TypeError, ValueError):
        budget = 0.0
    return {
        "monthly_budget": budget if math.isfinite(budget) and budget >= 0 else 0.0,
        "strict_offline": stored.get("strict_offline", "1") == "1",
    }

def update_settings(user_id: str, monthly_budget: Optional[float] = None, strict_offline: Optional[bool] = None) -> dict[str, Any]:
    if monthly_budget is not None and (not math.isfinite(monthly_budget) or monthly_budget < 0):
        raise HTTPException(400, "预算不能为负数")
    with closing(_connect(user_id)) as conn, conn:
        if monthly_budget is not None:
            conn.execute("INSERT OR REPLACE INTO ledger_settings VALUES ('monthly_budget', ?)", (repr(round(monthly_budget, 2)),))
        if strict_offline is not None:
            conn.execute("INSERT OR REPLACE INTO ledger_settings VALUES ('strict_offline', ?)", ("1" if strict_offline else "0",))
        return _read_settings(conn)

def _hidden_leaks(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    groups: dict[str, list[float]] = {}
    for row in rows:
        ride = row["category"] == "交通" and RIDE_RE.search(f"{row['merchant']} {row['note']}")
        groups.setdefault("打车" if ride else row["category"], []).append(row["amount"])
    return sorted(
        ({"label": label, "count": len(amounts), "total": round(sum(amounts), 2), "avg": round(sum(amounts) / len(amounts), 2)}
         for label, amounts in groups.items()
         if len(amounts) >= LEAK_MIN_COUNT and sum(amounts) / len(amounts) <= LEAK_MAX_AVG),
        key=lambda leak: -leak["total"],
    )

def get_ledger_overview(user_id: str, month: Optional[str] = None) -> dict[str, Any]:
    _validate_month(month)
    this_month = date.today().strftime("%Y-%m")
    with closing(_connect(user_id)) as conn:
        months = [r[0] for r in conn.execute("SELECT DISTINCT month FROM ledger_entries ORDER BY month DESC")]
        if not month:
            month = months[0] if months else this_month
        rows = conn.execute(
            "SELECT * FROM ledger_entries WHERE month = ? ORDER BY occurred_date DESC, created_at DESC LIMIT 2000",
            (month,),
        ).fetchall()
        settings = _read_settings(conn)
    total = round(sum(r["amount"] for r in rows), 2)
    days_in = calendar.monthrange(int(month[:4]), int(month[5:7]))[1]
    elapsed = date.today().day if month == this_month else (days_in if month < this_month else 0)
    days_left = max(days_in - elapsed + (1 if month == this_month else 0), 1)
    budget = settings["monthly_budget"]
    remaining = round(budget - total, 2) if budget > 0 else 0.0  # no budget set -> nothing to compare against
    buckets: dict[str, dict[str, Any]] = {}
    for row in rows:
        slot = buckets.setdefault(row["category"], {"name": row["category"], "total": 0.0, "count": 0})
        slot["total"] += row["amount"]
        slot["count"] += 1
    categories = sorted(
        ({**b, "total": round(b["total"], 2), "pct": round(b["total"] / total * 100, 1) if total else 0.0} for b in buckets.values()),
        key=lambda c: -c["total"],
    )
    return {
        "month": month, "available_months": months, "settings": settings,
        "summary": {
            "month_total": total, "count": len(rows), "daily_avg": round(total / elapsed, 2) if elapsed else 0.0,
            "budget": budget, "budget_remaining": remaining,
            "budget_pct": round(total / budget * 100, 1) if budget > 0 else 0.0,
            "daily_allowance": round(remaining / days_left, 2) if budget > 0 and remaining > 0 else 0.0,
        },
        "categories": categories, "hidden_leaks": _hidden_leaks(rows),
        "top_expenses": sorted(
            ({"id": r["id"], "amount": r["amount"], "category": r["category"], "merchant": r["merchant"],
              "occurred_date": r["occurred_date"]} for r in rows),
            key=lambda expense: -expense["amount"],
        )[:5],
        "entries": [{k: r[k] for k in ENTRY_FIELDS} for r in rows],
    }

def export_ledger_csv(user_id: str, month: Optional[str] = None) -> bytes:
    _validate_month(month)
    query = "SELECT * FROM ledger_entries" + (" WHERE month = ?" if month else "") + " ORDER BY occurred_date, created_at"
    with closing(_connect(user_id)) as conn:
        rows = conn.execute(query, (month,) if month else ()).fetchall()
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(EXPORT_COLUMNS)
    for row in rows:
        cells = [row["occurred_date"], row["month"], f"{row['amount']:.2f}", row["category"], row["merchant"],
                 row["payment_method"], row["note"], row["source"], row["created_at"]]
        writer.writerow(["'" + c if isinstance(c, str) and c[:1] in "=+-@\t\r" else c for c in cells])
    return b"\xef\xbb\xbf" + buffer.getvalue().encode("utf-8")

def wipe_all_ledger_data(user_id: str) -> dict[str, Any]:
    """Delete every entry and reset settings for this user only, then VACUUM so pages are really freed."""
    with closing(_connect(user_id)) as conn, conn:
        removed = conn.execute("DELETE FROM ledger_entries").rowcount
        conn.execute("DELETE FROM ledger_settings")
        conn.commit()  # VACUUM cannot run inside an open transaction
        conn.execute("VACUUM")
    return {"ok": True, "removed": removed}
