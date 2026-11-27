from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .auth import get_current_user
from .workbench_ledger import (
    create_entries,
    delete_entry,
    existing_fingerprints,
    export_ledger_csv,
    get_ledger_overview,
    update_entry,
    update_settings,
    wipe_all_ledger_data,
)
from .workbench_ledger_bill import MAX_BILL_BYTES
from .workbench_ledger_import import parse_bill_file, parse_quick_text
from .workbench_ledger_ocr import MAX_OCR_BYTES, parse_receipt_image

router = APIRouter(prefix="/ledger", tags=["ledger"])

_BOUNDARY_RE = re.compile(r'boundary="?([^";]+)"?', re.I)
_MULTIPART_OVERHEAD = 64 * 1024  # headroom for multipart framing (boundaries + part headers) only


async def read_upload(request: Request, max_bytes: int, label: str = "文件") -> tuple[str, bytes]:
    """Read the single `file` part fully in memory.

    Deliberately not `UploadFile`: the framework spools file parts > 1MB to a temp file on disk,
    which would violate the never-persist-screenshot guarantee for OCR.
    """
    boundary = _BOUNDARY_RE.search(request.headers.get("content-type", ""))
    if not boundary:
        raise HTTPException(400, "请使用 multipart/form-data 上传文件")
    body_cap = max_bytes + _MULTIPART_OVERHEAD
    too_large = f"{label}不能超过 {max_bytes // 1024 // 1024}MB"
    if int(request.headers.get("content-length") or 0) > body_cap:
        raise HTTPException(413, too_large)
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > body_cap:
            raise HTTPException(413, too_large)
    delimiter = b"--" + boundary.group(1).encode("latin-1")
    for part in bytes(raw).split(delimiter)[1:]:
        if part.startswith(b"--"):
            break
        head, _, body = part.removeprefix(b"\r\n").partition(b"\r\n\r\n")
        if b'filename="' in head or b'name="file"' in head:
            name = re.search(rb'filename="([^"]*)"', head)
            return (name.group(1).decode("utf-8", "replace") if name else "upload"), body[:-2] if body.endswith(b"\r\n") else body
    raise HTTPException(400, "缺少上传文件字段 file")


def _existing(user_id: str, items: list[dict[str, Any]]) -> set[str]:
    """Fingerprints (of the given items) already stored for this user."""
    return existing_fingerprints(user_id, [x.get("fingerprint") or "" for x in items])


class LedgerEntryPayload(BaseModel):
    occurred_date: str = Field(default="", max_length=10)
    amount: float = Field(..., gt=0)
    category: str = Field(default="其他", max_length=16)
    merchant: str = Field(default="", max_length=120)
    payment_method: str = Field(default="", max_length=16)
    note: str = Field(default="", max_length=300)
    source: str = Field(default="manual", max_length=16)
    fingerprint: str = Field(default="", max_length=32)


class LedgerEntriesPayload(BaseModel):
    items: list[LedgerEntryPayload] = Field(..., min_length=1, max_length=5000)


class LedgerEntryPatchPayload(BaseModel):
    occurred_date: Optional[str] = Field(default=None, max_length=10)
    amount: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = Field(default=None, max_length=16)
    merchant: Optional[str] = Field(default=None, max_length=120)
    payment_method: Optional[str] = Field(default=None, max_length=16)
    note: Optional[str] = Field(default=None, max_length=300)


class LedgerSettingsPayload(BaseModel):
    monthly_budget: Optional[float] = Field(default=None, ge=0)
    strict_offline: Optional[bool] = None


class LedgerWipePayload(BaseModel):
    confirm: str = Field(..., min_length=1, max_length=16)


class LedgerQuickParsePayload(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


@router.get("")
def api_ledger_overview(month: Optional[str] = None, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return get_ledger_overview(user["id"], month)


@router.post("/entries")
def api_create_ledger_entries(body: LedgerEntriesPayload, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return create_entries(user["id"], [x.model_dump() for x in body.items])


@router.patch("/entries/{entry_id}")
def api_update_ledger_entry(
    entry_id: str, body: LedgerEntryPatchPayload, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return {"ok": True, "item": update_entry(user["id"], entry_id, body.model_dump(exclude_unset=True))}


@router.delete("/entries/{entry_id}")
def api_delete_ledger_entry(entry_id: str, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return delete_entry(user["id"], entry_id)


@router.put("/settings")
def api_update_ledger_settings(body: LedgerSettingsPayload, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return {"ok": True, "settings": update_settings(user["id"], body.monthly_budget, body.strict_offline)}


@router.post("/quick-parse")
def api_ledger_quick_parse(body: LedgerQuickParsePayload, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return {"items": parse_quick_text(body.text)}


@router.post("/ocr-parse")
async def api_ledger_ocr_parse(request: Request, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    _, raw = await read_upload(request, MAX_OCR_BYTES, "截图")
    return await parse_receipt_image(raw)


@router.post("/import-bill")
async def api_ledger_import_bill(
    request: Request, dry_run: str = "", user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    filename, raw = await read_upload(request, MAX_BILL_BYTES, "账单文件")
    try:
        parsed = parse_bill_file(filename, raw)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if dry_run == "1":
        known = _existing(user["id"], parsed["items"])
        for item in parsed["items"]:
            item["duplicate"] = item["fingerprint"] in known
        return {**parsed, "dry_run": True, "new_count": sum(not x["duplicate"] for x in parsed["items"])}
    result = create_entries(user["id"], parsed["items"])
    stats = {key: value for key, value in parsed.items() if key != "items"}
    return {**stats, "dry_run": False, "inserted": len(result["inserted"]), "skipped_duplicates": result["skipped"]}


@router.get("/export-csv")
def api_export_ledger_csv(month: Optional[str] = None, user: dict = Depends(get_current_user)) -> Response:
    payload = export_ledger_csv(user["id"], month)
    return Response(
        content=payload,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="ledger_{(month or "all").replace("-", "")}.csv"'},
    )


@router.delete("/wipe")
def api_wipe_ledger(body: LedgerWipePayload, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    if body.confirm != "WIPE":
        raise HTTPException(400, "请输入 WIPE 以确认清空全部账本数据")
    return wipe_all_ledger_data(user["id"])
