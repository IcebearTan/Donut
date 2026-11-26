from __future__ import annotations

import csv
import hashlib
import io
import os
import re
import zipfile
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote

from fastapi import HTTPException

from .vault import ensure_user_vault, resolve_vault_file

# Canonical Chinese columns matching Donut's existing `vault/archive/报销/ledger.csv`
BASE_COLUMNS = [
    "消费日期",
    "项目",
    "平台",
    "金额",
    "发票",
    "订单",
    "支付记录",
    "材料状态",
    "报单状态",
    "备注",
]
ATTACHMENT_COL = "附件路径"

CLAIM_STATUS_OPTIONS = [
    "待整理",
    "已整理-未报销",
    "已报销-未结款",
    "已结款",
    "取消报销",
]

MATERIAL_STATUS_OPTIONS = ["齐全", "缺材料", "待补", "核对中"]
DOC_CHECK_OPTIONS = ["有", "无", "金额不符", "待开"]


def _get_ledger_path(user_id: str) -> Path:
    dirs = ensure_user_vault(user_id)
    archive_root = dirs["archive"]
    primary = archive_root / "报销" / "ledger.csv"
    if primary.exists():
        return primary
    legacy = archive_root / "invoices" / "ledger.csv"
    if legacy.exists():
        return legacy
    primary.parent.mkdir(parents=True, exist_ok=True)
    return primary


def _parse_amount(val: Any) -> float:
    if val is None:
        return 0.0
    s = re.sub(r"[^\d.\-]", "", str(val))
    try:
        return round(float(s), 2)
    except ValueError:
        return 0.0


def _row_fingerprint(row: dict[str, str]) -> str:
    raw = "|".join(str(row.get(k, "")).strip() for k in BASE_COLUMNS)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def _scan_invoice_files(user_id: str) -> list[dict[str, str]]:
    """Index files inside `archive/报销/` and `archive/invoices/` for smart attachment linking."""
    dirs = ensure_user_vault(user_id)
    archive_root = dirs["archive"]
    indexed: list[dict[str, str]] = []
    for folder_name in ("报销", "invoices"):
        base = archive_root / folder_name
        if not base.exists() or not base.is_dir():
            continue
        for p in base.rglob("*"):
            if not p.is_file():
                continue
            if p.name.startswith(".") or p.name.lower() in ("ledger.csv", "readme.md"):
                continue
            rel = p.relative_to(archive_root).as_posix()
            indexed.append(
                {
                    "path": rel,
                    "name": p.name,
                    "lower": rel.lower(),
                    "ext": p.suffix.lower(),
                    "url": f"/portal-api/vault/download/archive/{quote(rel, safe='/')}",
                }
            )
    return indexed


def _match_attachments_for_row(
    row: dict[str, str], all_files: list[dict[str, str]]
) -> list[dict[str, str]]:
    explicit = str(row.get(ATTACHMENT_COL) or "").strip()
    if explicit:
        # Support exact file path or directory prefix (comma/semicolon separated)
        parts = [p.strip().strip("/") for p in re.split(r"[;,|]", explicit) if p.strip()]
        hits: list[dict[str, str]] = []
        seen: set[str] = set()
        for part in parts:
            for f in all_files:
                if f["path"] == part or f["path"].startswith(part + "/"):
                    if f["path"] not in seen:
                        seen.add(f["path"])
                        hits.append({"path": f["path"], "name": f["name"], "url": f["url"], "ext": f["ext"]})
        if hits:
            return hits[:12]

    # Smart heuristic match: month folder (YYYY-MM) + title/platform keywords
    spend_date = str(row.get("消费日期") or "").strip()
    month_key = spend_date[:7] if len(spend_date) >= 7 else ""
    title = str(row.get("项目") or "").strip()
    platform = str(row.get("平台") or "").strip()

    # Extract meaningful Chinese/alphanumeric tokens (len >= 2)
    tokens = [
        t.lower()
        for t in re.findall(r"[A-Za-z0-9]{2,}|[\u4e00-\u9fff]{2,}", f"{title} {platform}")
        if t.lower() not in ("plan", "max", "coding", "11月", "10月", "9月", "8月", "7月")
    ]
    if platform and platform.lower() not in tokens:
        tokens.append(platform.lower())

    candidates: list[tuple[int, dict[str, str]]] = []
    for f in all_files:
        low = f["lower"]
        if month_key and month_key not in low:
            continue
        score = 0
        for tok in tokens:
            if tok in low:
                score += 2 if tok != platform.lower() else 1
        if score >= 2:
            candidates.append((score, f))

    candidates.sort(key=lambda x: (-x[0], x[1]["name"]))
    return [
        {"path": f["path"], "name": f["name"], "url": f["url"], "ext": f["ext"]}
        for _, f in candidates[:6]
    ]


def _read_raw_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.exists():
        return list(BASE_COLUMNS), []
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    if not text.strip():
        return list(BASE_COLUMNS), []
    reader = csv.DictReader(io.StringIO(text))
    headers = list(reader.fieldnames or BASE_COLUMNS)
    rows: list[dict[str, str]] = []
    for raw in reader:
        if not raw or all(not str(v or "").strip() for v in raw.values()):
            continue
        cleaned = {k: str(v or "").strip() for k, v in raw.items() if k is not None}
        rows.append(cleaned)
    return headers, rows


def _write_raw_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Preserve canonical columns + any extra columns present
    final_headers = list(headers)
    for col in BASE_COLUMNS:
        if col not in final_headers:
            final_headers.append(col)
    if any(str(r.get(ATTACHMENT_COL) or "").strip() for r in rows) and ATTACHMENT_COL not in final_headers:
        final_headers.append(ATTACHMENT_COL)

    tmp = path.with_suffix(".csv.tmp")
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=final_headers, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for r in rows:
        writer.writerow({k: r.get(k, "") for k in final_headers})
    tmp.write_text(buf.getvalue(), encoding="utf-8")
    os.replace(str(tmp), str(path))


def _row_to_item(
    idx: int, row: dict[str, str], all_files: list[dict[str, str]]
) -> dict[str, Any]:
    spend_date = row.get("消费日期", "")
    month = spend_date[:7] if len(spend_date) >= 7 else ""
    amount = _parse_amount(row.get("金额"))
    return {
        "row_index": idx,
        "fingerprint": _row_fingerprint(row),
        "spend_date": spend_date,
        "month": month,
        "title": row.get("项目", ""),
        "platform": row.get("平台", ""),
        "amount": amount,
        "has_invoice": row.get("发票", "有"),
        "has_order": row.get("订单", "有"),
        "has_payment": row.get("支付记录", "有"),
        "material_status": row.get("材料状态", "齐全"),
        "claim_status": row.get("报单状态", "已整理-未报销"),
        "note": row.get("备注", ""),
        "attachment_path": row.get(ATTACHMENT_COL, ""),
        "attachments": _match_attachments_for_row(row, all_files),
    }


def list_reimbursements(user_id: str) -> dict[str, Any]:
    path = _get_ledger_path(user_id)
    _, rows = _read_raw_csv(path)
    all_files = _scan_invoice_files(user_id)
    items = [_row_to_item(idx, r, all_files) for idx, r in enumerate(rows)]

    # Summary calculations (exclude 取消报销 from active claimable totals)
    active_total = 0.0
    pending_submit_total = 0.0
    pending_submit_count = 0
    in_flight_total = 0.0
    in_flight_count = 0
    settled_total = 0.0
    settled_count = 0
    cancelled_count = 0

    months_set: set[str] = set()
    platforms_set: set[str] = set()
    statuses_set: set[str] = set(CLAIM_STATUS_OPTIONS)

    for it in items:
        if it["month"]:
            months_set.add(it["month"])
        if it["platform"]:
            platforms_set.add(it["platform"])
        st = it["claim_status"] or "待整理"
        statuses_set.add(st)
        amt = float(it["amount"])
        if "取消" in st:
            cancelled_count += 1
            continue
        active_total += amt
        if "已结款" in st or st == "已报销":
            settled_total += amt
            settled_count += 1
        elif "未结款" in st or "已提交" in st or "投单" in st:
            in_flight_total += amt
            in_flight_count += 1
        else:
            pending_submit_total += amt
            pending_submit_count += 1

    # Display newest spend_date first while preserving original CSV row_index
    items_sorted = sorted(items, key=lambda x: (x["spend_date"], x["row_index"]), reverse=True)

    dirs = ensure_user_vault(user_id)
    rel_ledger = (
        path.relative_to(dirs["archive"]).as_posix()
        if path.exists()
        else "报销/ledger.csv"
    )

    return {
        "ledger_path": rel_ledger,
        "items": items_sorted,
        "summary": {
            "total_count": len(items),
            "active_total": round(active_total, 2),
            "pending_submit_total": round(pending_submit_total, 2),
            "pending_submit_count": pending_submit_count,
            "in_flight_total": round(in_flight_total, 2),
            "in_flight_count": in_flight_count,
            "settled_total": round(settled_total, 2),
            "settled_count": settled_count,
            "cancelled_count": cancelled_count,
        },
        "facets": {
            "months": sorted(months_set, reverse=True),
            "platforms": sorted(platforms_set),
            "claim_statuses": CLAIM_STATUS_OPTIONS
            + sorted(s for s in statuses_set if s not in CLAIM_STATUS_OPTIONS),
            "material_statuses": MATERIAL_STATUS_OPTIONS,
            "doc_checks": DOC_CHECK_OPTIONS,
        },
    }


def create_reimbursement(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    path = _get_ledger_path(user_id)
    headers, rows = _read_raw_csv(path)
    title = str(payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="请填写报销项目名称")

    amt = _parse_amount(payload.get("amount"))
    new_row: dict[str, str] = {
        "消费日期": str(payload.get("spend_date") or "").strip(),
        "项目": title,
        "平台": str(payload.get("platform") or "").strip(),
        "金额": f"{amt:.2f}",
        "发票": str(payload.get("has_invoice") or "有").strip(),
        "订单": str(payload.get("has_order") or "有").strip(),
        "支付记录": str(payload.get("has_payment") or "有").strip(),
        "材料状态": str(payload.get("material_status") or "齐全").strip(),
        "报单状态": str(payload.get("claim_status") or "已整理-未报销").strip(),
        "备注": str(payload.get("note") or "").strip(),
    }
    att = str(payload.get("attachment_path") or "").strip()
    if att:
        new_row[ATTACHMENT_COL] = att

    rows.append(new_row)
    _write_raw_csv(path, headers, rows)
    all_files = _scan_invoice_files(user_id)
    return _row_to_item(len(rows) - 1, new_row, all_files)


def update_reimbursement(
    user_id: str, row_index: int, payload: dict[str, Any]
) -> dict[str, Any]:
    path = _get_ledger_path(user_id)
    headers, rows = _read_raw_csv(path)
    if row_index < 0 or row_index >= len(rows):
        raise HTTPException(status_code=404, detail="未找到该报销记录，请刷新重试")

    target = rows[row_index]
    expected_fp = payload.get("expected_fingerprint")
    if expected_fp and _row_fingerprint(target) != expected_fp:
        raise HTTPException(status_code=409, detail="该报销记录刚被更新过，请刷新后再修改")

    field_map = {
        "spend_date": "消费日期",
        "title": "项目",
        "platform": "平台",
        "has_invoice": "发票",
        "has_order": "订单",
        "has_payment": "支付记录",
        "material_status": "材料状态",
        "claim_status": "报单状态",
        "note": "备注",
        "attachment_path": ATTACHMENT_COL,
    }
    for api_key, csv_col in field_map.items():
        if api_key in payload and payload[api_key] is not None:
            target[csv_col] = str(payload[api_key]).strip()
    if "amount" in payload and payload["amount"] is not None:
        target["金额"] = f"{_parse_amount(payload['amount']):.2f}"

    if not target.get("项目", "").strip():
        raise HTTPException(status_code=400, detail="报销项目名称不能为空")

    rows[row_index] = target
    _write_raw_csv(path, headers, rows)
    all_files = _scan_invoice_files(user_id)
    return _row_to_item(row_index, target, all_files)


def delete_reimbursement(
    user_id: str, row_index: int, expected_fingerprint: Optional[str] = None
) -> dict[str, Any]:
    path = _get_ledger_path(user_id)
    headers, rows = _read_raw_csv(path)
    if row_index < 0 or row_index >= len(rows):
        raise HTTPException(status_code=404, detail="未找到该报销记录")
    if expected_fingerprint and _row_fingerprint(rows[row_index]) != expected_fingerprint:
        raise HTTPException(status_code=409, detail="该报销记录刚被改动，请刷新后再删除")
    rows.pop(row_index)
    _write_raw_csv(path, headers, rows)
    return {"ok": True}


def build_reimbursement_export_zip(
    user_id: str, row_indices: Optional[list[int]] = None
) -> bytes:
    """Bundle selected (or all active) reimbursement rows as UTF-8-BOM CSV + linked invoice files."""
    path = _get_ledger_path(user_id)
    _, rows = _read_raw_csv(path)
    all_files = _scan_invoice_files(user_id)

    if row_indices:
        selected_pairs = [
            (i, rows[i]) for i in row_indices if 0 <= i < len(rows)
        ]
    else:
        selected_pairs = list(enumerate(rows))

    if not selected_pairs:
        raise HTTPException(status_code=400, detail="没有可导出的报销记录")

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 1. Summary CSV (UTF-8 with BOM so Excel on Windows/macOS opens Chinese cleanly)
        csv_buf = io.StringIO()
        writer = csv.DictWriter(csv_buf, fieldnames=BASE_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        total = 0.0
        for _, r in selected_pairs:
            writer.writerow({k: r.get(k, "") for k in BASE_COLUMNS})
            if "取消" not in str(r.get("报单状态") or ""):
                total += _parse_amount(r.get("金额"))
        writer.writerow({"消费日期": "合计", "项目": f"共 {len(selected_pairs)} 笔", "金额": f"{total:.2f}"})
        zf.writestr("报销汇总表.csv", ("\ufeff" + csv_buf.getvalue()).encode("utf-8"))

        # 2. Linked original invoice files from user's isolated archive
        added_paths: set[str] = set()
        for _, r in selected_pairs:
            atts = _match_attachments_for_row(r, all_files)
            for att in atts:
                rel = att["path"]
                if rel in added_paths:
                    continue
                try:
                    fp = resolve_vault_file(user_id, "archive", rel)
                except ValueError:
                    continue
                if fp and fp.exists() and fp.is_file():
                    added_paths.add(rel)
                    zf.write(fp, arcname=f"凭证原件/{rel}")

    return out.getvalue()
