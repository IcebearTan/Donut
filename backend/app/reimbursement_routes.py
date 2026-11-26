from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from .auth import get_current_user
from .reimbursement import (
    build_reimbursement_export_zip,
    create_reimbursement,
    delete_reimbursement,
    list_reimbursements,
    update_reimbursement,
)

router = APIRouter()


class ReimbursementPayload(BaseModel):
    spend_date: str = Field(default="", max_length=32)
    title: str = Field(..., min_length=1, max_length=160)
    platform: str = Field(default="", max_length=64)
    amount: float = 0.0
    has_invoice: str = Field(default="有", max_length=32)
    has_order: str = Field(default="有", max_length=32)
    has_payment: str = Field(default="有", max_length=32)
    material_status: str = Field(default="齐全", max_length=32)
    claim_status: str = Field(default="已整理-未报销", max_length=32)
    note: str = Field(default="", max_length=500)
    attachment_path: str = Field(default="", max_length=400)


class ReimbursementPatchPayload(BaseModel):
    expected_fingerprint: Optional[str] = None
    spend_date: Optional[str] = Field(default=None, max_length=32)
    title: Optional[str] = Field(default=None, max_length=160)
    platform: Optional[str] = Field(default=None, max_length=64)
    amount: Optional[float] = None
    has_invoice: Optional[str] = Field(default=None, max_length=32)
    has_order: Optional[str] = Field(default=None, max_length=32)
    has_payment: Optional[str] = Field(default=None, max_length=32)
    material_status: Optional[str] = Field(default=None, max_length=32)
    claim_status: Optional[str] = Field(default=None, max_length=32)
    note: Optional[str] = Field(default=None, max_length=500)
    attachment_path: Optional[str] = Field(default=None, max_length=400)


class ReimbursementExportRequest(BaseModel):
    row_indices: list[int] = Field(default_factory=list)


@router.get("/reimbursements")
def api_list_reimbursements(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return list_reimbursements(user["id"])


@router.post("/reimbursements")
def api_create_reimbursement(
    body: ReimbursementPayload, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    item = create_reimbursement(user["id"], body.model_dump())
    return {"ok": True, "item": item}


@router.patch("/reimbursements/{row_index}")
def api_update_reimbursement(
    row_index: int,
    body: ReimbursementPatchPayload,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    item = update_reimbursement(
        user["id"], row_index, body.model_dump(exclude_unset=True)
    )
    return {"ok": True, "item": item}


@router.delete("/reimbursements/{row_index}")
def api_delete_reimbursement(
    row_index: int,
    fp: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return delete_reimbursement(user["id"], row_index, expected_fingerprint=fp)


@router.post("/reimbursements/export-zip")
def api_export_reimbursements_zip(
    body: ReimbursementExportRequest, user: dict = Depends(get_current_user)
) -> Response:
    raw_zip = build_reimbursement_export_zip(
        user["id"], body.row_indices if body.row_indices else None
    )
    return Response(
        content=raw_zip,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="reimbursement_bundle.zip"'},
    )
