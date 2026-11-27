#!/home/donut/.openclaw/tools-venv/bin/python
"""
Donut Workbench Official Reimbursement CLI (`报销台账` — `vault/archive/报销/ledger.csv`)
Stdlib-only, atomic UTF-8-BOM CSV CRUD strictly aligned with Portal's 11 canonical columns.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

CST = timezone(timedelta(hours=8))
COLUMNS = ["消费日期", "项目", "平台", "金额", "发票", "订单", "支付记录", "材料状态", "报单状态", "备注", "附件路径"]
CLAIM_STATUSES = ("待整理", "已整理-未报销", "已报销-未结款", "已结款", "取消报销")
MATERIAL_STATUSES = ("齐全", "缺材料", "待补", "核对中")
DOC_CHECKS = ("有", "无", "金额不符", "待开")


def resolve_csv(vault_dir: str | None) -> Path:
    if vault_dir:
        base = Path(vault_dir).expanduser().resolve()
    else:
        sv = Path(__file__).resolve().parent.parent / "vault"
        cv = Path.cwd() / "vault"
        base = sv if sv.exists() else (cv if cv.exists() else None)  # type: ignore[assignment]
        if base is None:
            raise SystemExit("Cannot locate workspace vault directory; pass --vault-dir explicitly")
    primary = base / "archive" / "报销" / "ledger.csv"
    if primary.exists():
        return primary
    legacy = base / "archive" / "invoices" / "ledger.csv"
    if legacy.exists():
        return legacy
    primary.parent.mkdir(parents=True, exist_ok=True)
    return primary


def parse_amount(val: Any) -> float:
    s = re.sub(r"[^\d.\-]", "", str(val or ""))
    try:
        return round(float(s), 2)
    except ValueError:
        return 0.0


def load_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.exists():
        return list(COLUMNS), []
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    reader = csv.DictReader(text.splitlines())
    headers = list(reader.fieldnames or COLUMNS)
    for col in COLUMNS:
        if col not in headers:
            headers.append(col)
    rows: list[dict[str, str]] = []
    for raw in reader:
        if not any(str(v or "").strip() for v in raw.values()):
            continue
        rows.append({k: str(raw.get(k) or "").strip() for k in headers})
    return headers, rows


def save_rows(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".csv.tmp")
    with tmp.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow({k: str(r.get(k) or "") for k in headers})
    os.replace(str(tmp), str(path))


def emit(obj: dict[str, Any], pretty: bool = False) -> int:
    print(json.dumps(obj, ensure_ascii=False, indent=2 if pretty else None, separators=None if pretty else (",", ":")))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Donut Workbench Reimbursement CLI (报销台账)")
    p.add_argument("--vault-dir", help="Override vault directory path")
    p.add_argument("--pretty", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_ls = sub.add_parser("list", help="List reimbursement rows with summary")
    p_ls.add_argument("--month", default=None, help="Filter YYYY-MM")
    p_ls.add_argument("--status", default=None, choices=CLAIM_STATUSES)

    p_add = sub.add_parser("add", help="Append a reimbursement record")
    p_add.add_argument("--date", default=None, help="YYYY-MM-DD (default today)")
    p_add.add_argument("--title", required=True, help="项目名称")
    p_add.add_argument("--platform", default="", help="消费平台")
    p_add.add_argument("--amount", type=float, required=True)
    p_add.add_argument("--invoice", default="无", choices=DOC_CHECKS)
    p_add.add_argument("--order", default="无", choices=DOC_CHECKS)
    p_add.add_argument("--payment", default="无", choices=DOC_CHECKS)
    p_add.add_argument("--material", default="核对中", choices=MATERIAL_STATUSES)
    p_add.add_argument("--status", default="待整理", choices=CLAIM_STATUSES)
    p_add.add_argument("--note", default="")
    p_add.add_argument("--attachment", default="", help="Relative path under vault/archive/")

    p_upd = sub.add_parser("update", help="Update a row by 1-based row_index")
    p_upd.add_argument("--row", type=int, required=True, help="row_index from list")
    p_upd.add_argument("--date")
    p_upd.add_argument("--title")
    p_upd.add_argument("--platform")
    p_upd.add_argument("--amount", type=float)
    p_upd.add_argument("--invoice", choices=DOC_CHECKS)
    p_upd.add_argument("--order", choices=DOC_CHECKS)
    p_upd.add_argument("--payment", choices=DOC_CHECKS)
    p_upd.add_argument("--material", choices=MATERIAL_STATUSES)
    p_upd.add_argument("--status", choices=CLAIM_STATUSES)
    p_upd.add_argument("--note")
    p_upd.add_argument("--attachment")

    p_del = sub.add_parser("delete", help="Delete a row by 1-based row_index")
    p_del.add_argument("--row", type=int, required=True)

    args = p.parse_args()
    csv_path = resolve_csv(args.vault_dir)
    headers, rows = load_rows(csv_path)

    if args.cmd == "list":
        out = []
        active_total = pending_total = settled_total = 0.0
        for idx, r in enumerate(rows, start=1):
            d = r.get("消费日期", "")
            st = r.get("报单状态", "待整理") or "待整理"
            if args.month and not d.startswith(args.month):
                continue
            if args.status and st != args.status:
                continue
            amt = parse_amount(r.get("金额"))
            if st != "取消报销":
                active_total += amt
            if st in ("待整理", "已整理-未报销"):
                pending_total += amt
            elif st == "已结款":
                settled_total += amt
            out.append({"row_index": idx, **r})
        return emit({
            "ok": True,
            "path": str(csv_path),
            "count": len(out),
            "summary": {
                "active_total": round(active_total, 2),
                "pending_total": round(pending_total, 2),
                "settled_total": round(settled_total, 2),
            },
            "items": out,
        }, args.pretty)

    if args.cmd == "add":
        day = (args.date or datetime.now(CST).date().isoformat()).strip()
        row = {col: "" for col in headers}
        row.update({
            "消费日期": day,
            "项目": args.title.strip()[:80],
            "平台": args.platform.strip()[:40],
            "金额": f"{round(float(args.amount), 2):.2f}",
            "发票": args.invoice,
            "订单": args.order,
            "支付记录": args.payment,
            "材料状态": args.material,
            "报单状态": args.status,
            "备注": args.note.strip()[:200],
            "附件路径": args.attachment.strip()[:240],
        })
        rows.append(row)
        save_rows(csv_path, headers, rows)
        return emit({"ok": True, "row_index": len(rows), "item": row}, args.pretty)

    if args.cmd == "update":
        if args.row < 1 or args.row > len(rows):
            return emit({"ok": False, "error": f"行号越界：{args.row}（共 {len(rows)} 行）"}, args.pretty) or 1
        cur = dict(rows[args.row - 1])
        mapping = [
            ("date", "消费日期"), ("title", "项目"), ("platform", "平台"),
            ("invoice", "发票"), ("order", "订单"), ("payment", "支付记录"),
            ("material", "材料状态"), ("status", "报单状态"), ("note", "备注"), ("attachment", "附件路径"),
        ]
        for attr, col in mapping:
            val = getattr(args, attr)
            if val is not None:
                cur[col] = str(val).strip()
        if args.amount is not None:
            cur["金额"] = f"{round(float(args.amount), 2):.2f}"
        rows[args.row - 1] = cur
        save_rows(csv_path, headers, rows)
        return emit({"ok": True, "row_index": args.row, "item": cur}, args.pretty)

    if args.cmd == "delete":
        if args.row < 1 or args.row > len(rows):
            return emit({"ok": False, "error": f"行号越界：{args.row}（共 {len(rows)} 行）"}, args.pretty) or 1
        removed = rows.pop(args.row - 1)
        save_rows(csv_path, headers, rows)
        return emit({"ok": True, "deleted_row": args.row, "item": removed}, args.pretty)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
