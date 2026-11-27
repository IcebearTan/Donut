from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .auth import get_current_user
from .workbench_pomodoro import (
    delete_pomodoro_session,
    get_pomodoro_state,
    record_pomodoro_session,
    update_pomodoro_settings,
)

router = APIRouter()


class PomodoroSettingsPatch(BaseModel):
    focus_minutes: Optional[int] = Field(default=None, ge=5, le=120)
    short_break_minutes: Optional[int] = Field(default=None, ge=1, le=30)
    long_break_minutes: Optional[int] = Field(default=None, ge=5, le=60)
    long_break_interval: Optional[int] = Field(default=None, ge=2, le=8)
    daily_goal: Optional[int] = Field(default=None, ge=1, le=24)
    sound_enabled: Optional[bool] = None
    wake_lock_enabled: Optional[bool] = None


class PomodoroSessionCreate(BaseModel):
    client_id: str = Field(default="", max_length=64)
    duration_minutes: int = Field(default=25, ge=1, le=180)
    started_at: Optional[int] = None
    completed_at: Optional[int] = None
    tag: str = Field(default="学习", max_length=24)
    note: str = Field(default="", max_length=120)


@router.get("/pomodoro")
def api_get_pomodoro(user: dict = Depends(get_current_user)) -> dict[str, Any]:
    return get_pomodoro_state(user["id"])


@router.patch("/pomodoro/settings")
def api_patch_pomodoro_settings(
    body: PomodoroSettingsPatch, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return update_pomodoro_settings(user["id"], body.model_dump(exclude_unset=True))


@router.post("/pomodoro/sessions")
def api_record_pomodoro_session(
    body: PomodoroSessionCreate, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return record_pomodoro_session(user["id"], body.model_dump(exclude_unset=True))


@router.delete("/pomodoro/sessions/{session_id}")
def api_delete_pomodoro_session(
    session_id: str, user: dict = Depends(get_current_user)
) -> dict[str, Any]:
    return delete_pomodoro_session(user["id"], session_id)
