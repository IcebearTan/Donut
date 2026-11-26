from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import HTTPException

from .config import OPENCLAW_GATEWAY_URL, USER_AGENT_MAP, load_openclaw_token


def _gateway_ws_url() -> str:
    parsed = urlparse(OPENCLAW_GATEWAY_URL)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    netloc = parsed.netloc or "127.0.0.1:18789"
    return f"{scheme}://{netloc}"


def _user_agent_id(user_id: str) -> str:
    agent_id = USER_AGENT_MAP.get(user_id)
    if not agent_id:
        raise HTTPException(status_code=400, detail=f"未配置用户 {user_id} 对应的 OpenClaw Agent")
    return agent_id


def _job_agent_id(raw: dict[str, Any]) -> str:
    return str(raw.get("agentId") or raw.get("effectiveAgentId") or "main")


def _is_system_job(raw: dict[str, Any]) -> bool:
    decl = str(raw.get("declarationKey") or "").strip()
    desc = str(raw.get("description") or "")
    return bool(decl) or "[managed-by=" in desc


def _normalize_job(raw: dict[str, Any]) -> dict[str, Any]:
    state = raw.get("state") or {}
    payload = raw.get("payload") or {}
    schedule = raw.get("schedule") or {}
    last_status = (
        state.get("lastRunStatus")
        or state.get("lastStatus")
        or raw.get("lastRunStatus")
        or None
    )
    return {
        "id": str(raw.get("id") or ""),
        "name": str(raw.get("name") or "未命名任务"),
        "description": str(raw.get("description") or ""),
        "enabled": bool(raw.get("enabled", True)),
        "is_system": _is_system_job(raw),
        "agent_id": _job_agent_id(raw),
        "schedule": schedule,
        "message": str(payload.get("message") or ""),
        "payload_kind": str(payload.get("kind") or "agentTurn"),
        "session_target": str(raw.get("sessionTarget") or "isolated"),
        "delete_after_run": bool(raw.get("deleteAfterRun", False)),
        "created_at": raw.get("createdAtMs"),
        "updated_at": raw.get("updatedAtMs"),
        "next_run_at": state.get("nextRunAtMs") or raw.get("nextRunAtMs"),
        "last_run_at": state.get("lastRunAtMs") or raw.get("lastRunAtMs"),
        "last_status": str(last_status) if last_status else None,
        "last_duration_ms": state.get("lastDurationMs"),
        "last_error": state.get("lastError"),
        "delivery_warning": state.get("lastDeliveryError"),
        "consecutive_errors": int(state.get("consecutiveErrors") or 0),
    }


def _normalize_run(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(entry.get("runId") or f"{entry.get('jobId', '')}-{entry.get('ts', 0)}"),
        "job_id": str(entry.get("jobId") or ""),
        "job_name": str(entry.get("jobName") or ""),
        "ts": entry.get("ts"),
        "run_at": entry.get("runAtMs") or entry.get("ts"),
        "duration_ms": entry.get("durationMs"),
        "status": str(entry.get("status") or entry.get("completionStatus") or "unknown"),
        "summary": str(entry.get("summary") or ""),
        "error": str(entry.get("error") or "") or None,
        "model": str(entry.get("model") or "") or None,
        "provider": str(entry.get("provider") or "") or None,
        "next_run_at": entry.get("nextRunAtMs"),
    }


def _validate_schedule(schedule: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(schedule, dict):
        raise HTTPException(status_code=400, detail="无效的调度计划格式")
    kind = str(schedule.get("kind") or "").strip()
    if kind == "cron":
        expr = str(schedule.get("expr") or "").strip()
        parts = expr.split()
        if len(parts) not in (5, 6):
            raise HTTPException(status_code=400, detail="Cron 表达式必须为 5 段或 6 段（例如 0 9 * * *）")
        tz = str(schedule.get("tz") or "Asia/Shanghai").strip() or "Asia/Shanghai"
        return {"kind": "cron", "expr": expr, "tz": tz}
    if kind == "every":
        try:
            every_ms = int(schedule.get("everyMs") or 0)
        except (TypeError, ValueError):
            every_ms = 0
        if every_ms < 60_000:
            raise HTTPException(status_code=400, detail="循环间隔不能小于 1 分钟")
        return {"kind": "every", "everyMs": every_ms}
    if kind == "at":
        at_val = str(schedule.get("at") or "").strip()
        if not at_val:
            raise HTTPException(status_code=400, detail="请指定一次性执行的时间")
        return {"kind": "at", "at": at_val}
    raise HTTPException(status_code=400, detail="不支持的定时类型（仅支持 cron / every / at）")


async def _gateway_rpc_batch(
    calls: list[tuple[str, dict[str, Any]]],
    *,
    timeout: float = 15.0,
) -> list[dict[str, Any]]:
    try:
        import websockets  # type: ignore
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"websockets 依赖不可用: {exc}")

    token = load_openclaw_token()
    if not token:
        raise HTTPException(status_code=503, detail="服务端未配置 OpenClaw Gateway Token")

    ws_url = _gateway_ws_url()
    try:
        async with websockets.connect(ws_url, open_timeout=4.0, close_timeout=2.0) as ws:
            # 1. Read challenge
            await asyncio.wait_for(ws.recv(), timeout=4.0)

            # 2. Authenticate with operator admin scopes
            connect_id = f"portal-cron-{uuid.uuid4().hex[:8]}"
            await ws.send(
                json.dumps(
                    {
                        "type": "req",
                        "id": connect_id,
                        "method": "connect",
                        "params": {
                            "minProtocol": 4,
                            "maxProtocol": 4,
                            "client": {
                                "id": "gateway-client",
                                "displayName": "Donut Portal Cron Manager",
                                "version": "1.0.0",
                                "platform": "linux",
                                "mode": "backend",
                            },
                            "role": "operator",
                            "scopes": ["operator.read", "operator.write", "operator.admin"],
                            "auth": {"token": token},
                        },
                    }
                )
            )
            hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=4.0))
            if not hello.get("ok"):
                err = (hello.get("error") or {}).get("message") or "Gateway 鉴权失败"
                raise HTTPException(status_code=502, detail=f"OpenClaw Gateway 鉴权失败: {err}")

            # 3. Execute requested RPC calls sequentially on the same WS session
            results: list[dict[str, Any]] = []
            for idx, (method, params) in enumerate(calls):
                rid = f"rpc-{idx}-{uuid.uuid4().hex[:8]}"
                await ws.send(
                    json.dumps(
                        {"type": "req", "id": rid, "method": method, "params": params}
                    )
                )
                deadline = asyncio.get_running_loop().time() + timeout
                while True:
                    rem = max(0.1, deadline - asyncio.get_running_loop().time())
                    raw = await asyncio.wait_for(ws.recv(), timeout=rem)
                    frame = json.loads(raw)
                    if frame.get("type") == "res" and frame.get("id") == rid:
                        if not frame.get("ok"):
                            err_obj = frame.get("error") or {}
                            msg = err_obj.get("message") or f"RPC {method} 调用失败"
                            raise HTTPException(status_code=400, detail=str(msg))
                        results.append(frame.get("payload") or {})
                        break
            return results
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="OpenClaw 定时调度器响应超时")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"无法连接 OpenClaw 定时调度器: {exc}")


async def _find_owned_job(user_id: str, job_id: str) -> dict[str, Any]:
    agent_id = _user_agent_id(user_id)
    (listed,) = await _gateway_rpc_batch([("cron.list", {"includeDisabled": True})])
    jobs = listed.get("jobs") or []
    for j in jobs:
        if str(j.get("id")) == job_id and _job_agent_id(j) == agent_id:
            return j
    raise HTTPException(status_code=404, detail="未找到该定时任务")


async def list_user_cron_jobs(user_id: str) -> dict[str, Any]:
    agent_id = _user_agent_id(user_id)
    status_payload, list_payload = await _gateway_rpc_batch(
        [
            ("cron.status", {}),
            ("cron.list", {"includeDisabled": True}),
        ]
    )
    raw_jobs = list_payload.get("jobs") or []
    owned = [
        _normalize_job(j) for j in raw_jobs if _job_agent_id(j) == agent_id
    ]
    # User jobs first (enabled first, then soonest next run), system jobs after
    owned.sort(
        key=lambda x: (
            1 if x["is_system"] else 0,
            0 if x["enabled"] else 1,
            x["next_run_at"] or 9_999_999_999_999,
            -(x["updated_at"] or 0),
        )
    )
    return {
        "scheduler": {
            "enabled": bool(status_payload.get("enabled", True)),
            "triggers_enabled": bool(status_payload.get("triggersEnabled", True)),
            "next_wake_at": status_payload.get("nextWakeAtMs"),
        },
        "jobs": owned,
    }


async def create_user_cron_job(
    *,
    user_id: str,
    name: str,
    message: str,
    schedule: dict[str, Any],
    description: str = "",
    enabled: bool = True,
    delete_after_run: bool = False,
) -> dict[str, Any]:
    agent_id = _user_agent_id(user_id)
    clean_name = name.strip()[:80]
    clean_msg = message.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="请填写任务名称")
    if not clean_msg:
        raise HTTPException(status_code=400, detail="请填写要让助手执行的具体指令")

    valid_schedule = _validate_schedule(schedule)
    params: dict[str, Any] = {
        "name": clean_name,
        "description": description.strip()[:300],
        "agentId": agent_id,
        "enabled": bool(enabled),
        "schedule": valid_schedule,
        "sessionTarget": "isolated",
        "wakeMode": "now",
        "payload": {
            "kind": "agentTurn",
            "message": clean_msg,
        },
        "delivery": {"mode": "none"},
    }
    if valid_schedule["kind"] == "at" and delete_after_run:
        params["deleteAfterRun"] = True

    (created,) = await _gateway_rpc_batch([("cron.add", params)])
    job_obj = created.get("job") if isinstance(created.get("job"), dict) else created
    return _normalize_job(job_obj)


async def update_user_cron_job(
    *,
    user_id: str,
    job_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    message: Optional[str] = None,
    schedule: Optional[dict[str, Any]] = None,
    enabled: Optional[bool] = None,
    delete_after_run: Optional[bool] = None,
) -> dict[str, Any]:
    existing = await _find_owned_job(user_id, job_id)
    patch: dict[str, Any] = {}
    if name is not None:
        clean_name = name.strip()[:80]
        if not clean_name:
            raise HTTPException(status_code=400, detail="任务名称不能为空")
        patch["name"] = clean_name
    if description is not None:
        patch["description"] = description.strip()[:300]
    if enabled is not None:
        patch["enabled"] = bool(enabled)
    if schedule is not None:
        patch["schedule"] = _validate_schedule(schedule)
    if message is not None:
        clean_msg = message.strip()
        if not clean_msg:
            raise HTTPException(status_code=400, detail="任务指令不能为空")
        existing_payload = dict(existing.get("payload") or {"kind": "agentTurn"})
        existing_payload["kind"] = existing_payload.get("kind") or "agentTurn"
        existing_payload["message"] = clean_msg
        patch["payload"] = existing_payload
    if delete_after_run is not None:
        patch["deleteAfterRun"] = bool(delete_after_run)

    if not patch:
        return _normalize_job(existing)

    (updated,) = await _gateway_rpc_batch(
        [("cron.update", {"id": job_id, "patch": patch})]
    )
    job_obj = updated.get("job") if isinstance(updated.get("job"), dict) else updated
    return _normalize_job(job_obj)


async def delete_user_cron_job(user_id: str, job_id: str) -> dict[str, Any]:
    existing = await _find_owned_job(user_id, job_id)
    if _is_system_job(existing):
        raise HTTPException(status_code=400, detail="系统内置自动化任务不可删除，你可以选择暂停它")
    await _gateway_rpc_batch([("cron.remove", {"id": job_id})])
    return {"ok": True}


async def run_user_cron_job(user_id: str, job_id: str) -> dict[str, Any]:
    await _find_owned_job(user_id, job_id)
    (res,) = await _gateway_rpc_batch(
        [("cron.run", {"id": job_id, "mode": "force"})],
        timeout=90.0,
    )
    return {"ok": True, "result": res}


async def get_user_cron_runs(
    user_id: str, job_id: str, limit: int = 20
) -> list[dict[str, Any]]:
    await _find_owned_job(user_id, job_id)
    safe_limit = max(1, min(50, int(limit)))
    (res,) = await _gateway_rpc_batch(
        [("cron.runs", {"id": job_id, "limit": safe_limit})]
    )
    entries = res.get("entries") or []
    return [_normalize_run(e) for e in entries]
