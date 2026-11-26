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
from .workbench_focus import (
    add_focus_item,
    clear_done_focus_items,
    delete_focus_item,
    get_focus_state,
    replace_focus_state,
    update_focus_item,
    update_focus_links,
)
from .workbench_modules import list_workbench_modules, update_workbench_modules

router = APIRouter(prefix="/portal-api/workbench", tags=["workbench"])


# ---------------------------------------------------------------------------
# Core 1: Today's Focus (Zero external dependency, per-user isolated)
# ---------------------------------------------------------------------------


class FocusExternalLinkPayload(BaseModel):
    id: Optional[str] = Field(default=None, max_length=48)
    label: str = Field(..., min_length=1, max_length=40)
    url: str = Field(..., min_length=1, max_length=500)


class FocusItemPayload(BaseModel):
    id: Optional[str] = Field(default=None, max_length=64)
    title: str = Field(..., min_length=1, max_length=200)
    urgency: str = Field(default="plan", max_length=16)
    tag: str = Field(default="", max_length=32)
    tag_color: str = Field(default="slate", max_length=16)
    countdown: str = Field(default="", max_length=48)
    progress: str = Field(default="", max_length=200)
    source_url: str = Field(default="", max_length=500)
    done: bool = False


class FocusItemPatchPayload(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    urgency: Optional[str] = Field(default=None, max_length=16)
    tag: Optional[str] = Field(default=None, max_length=32)
    tag_color: Optional[str] = Field(default=None, max_length=16)
    countdown: Optional[str] = Field(default=None, max_length=48)
    progress: Optional[str] = Field(default=None, max_length=200)
    source_url: Optional[str] = Field(default=None, max_length=500)
    done: Optional[bool] = None


class FocusReplacePayload(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    external_links: Optional[list[dict[str, Any]]] = None


class FocusLinksPayload(BaseModel):
    external_links: list[FocusExternalLinkPayload] = Field(default_factory=list, max_length=8)


@router.get("/focus")
def api_get_focus(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return get_focus_state(user["id"])


@router.put("/focus")
def api_replace_focus(
    body: FocusReplacePayload, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    state = replace_focus_state(
        user["id"], items=body.items, external_links=body.external_links
    )
    return {"ok": True, **state}


@router.post("/focus/items")
def api_add_focus_item(
    body: FocusItemPayload, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return add_focus_item(user["id"], body.model_dump())


@router.patch("/focus/items/{item_id}")
def api_update_focus_item(
    item_id: str,
    body: FocusItemPatchPayload,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return update_focus_item(user["id"], item_id, body.model_dump(exclude_unset=True))


@router.delete("/focus/items/{item_id}")
def api_delete_focus_item(
    item_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return delete_focus_item(user["id"], item_id)


@router.post("/focus/clear-done")
def api_clear_done_focus(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return clear_done_focus_items(user["id"])


@router.put("/focus/links")
def api_update_focus_links(
    body: FocusLinksPayload, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return update_focus_links(
        user["id"], [x.model_dump() for x in body.external_links]
    )


# ---------------------------------------------------------------------------
# Per-User Workbench Modules Registry & Ordering
# ---------------------------------------------------------------------------


class WorkbenchModuleEntry(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    enabled: Optional[bool] = None


class WorkbenchModulesUpdatePayload(BaseModel):
    items: list[WorkbenchModuleEntry] = Field(default_factory=list, max_length=100)


@router.get("/modules")
def api_list_workbench_modules(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return list_workbench_modules(user["id"])


@router.put("/modules")
def api_update_workbench_modules(
    body: WorkbenchModulesUpdatePayload, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return update_workbench_modules(
        user["id"], [x.model_dump(exclude_unset=True) for x in body.items]
    )


# ---------------------------------------------------------------------------
# Built-in Optional Plugin 1: Local Reimbursement Ledger
# ---------------------------------------------------------------------------


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
