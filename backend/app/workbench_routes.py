from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .auth import get_current_user
from .reimbursement_routes import router as reimbursement_router
from .workbench_apps import (
    delete_user_app,
    get_user_app_data,
    get_user_app_detail,
    get_user_app_html,
    save_user_app_data,
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
router.include_router(reimbursement_router)


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


class MicroAppDataPayload(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


@router.get("/apps/{app_id}")
def api_get_micro_app(
    app_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return get_user_app_detail(user["id"], app_id)


@router.get("/apps/{app_id}/data")
def api_get_micro_app_data(
    app_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return get_user_app_data(user["id"], app_id)


@router.put("/apps/{app_id}/data")
def api_save_micro_app_data(
    app_id: str,
    body: MicroAppDataPayload,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    return save_user_app_data(user["id"], app_id, body.data)


@router.get("/apps/{app_id}/html")
def api_get_micro_app_html(
    app_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return get_user_app_html(user["id"], app_id)


@router.delete("/apps/{app_id}")
def api_delete_micro_app(
    app_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return delete_user_app(user["id"], app_id)
