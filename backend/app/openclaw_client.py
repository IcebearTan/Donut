from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path
from typing import Any, AsyncIterator
from urllib.parse import urlparse

import httpx

from .config import OPENCLAW_GATEWAY_URL, USER_AGENT_MAP, load_openclaw_token

BUBBLE_BREAK_MARKER = "\n\n<!-- donut-bubble -->\n\n"


def _gateway_ws_url() -> str:
    parsed = urlparse(OPENCLAW_GATEWAY_URL)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    netloc = parsed.netloc or "127.0.0.1:18789"
    return f"{scheme}://{netloc}"


def build_input_payload(text: str, image_paths: list[Path]) -> Any:
    """Build OpenResponses `input` field with optional multimodal images."""
    if not image_paths:
        return text
    content: list[dict[str, Any]] = []
    if text.strip():
        content.append({"type": "input_text", "text": text})
    for img_path in image_paths:
        if not img_path.exists():
            continue
        suffix = img_path.suffix.lower().lstrip(".")
        mime = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "webp": "image/webp",
            "gif": "image/gif",
        }.get(suffix, "image/jpeg")
        b64 = base64.b64encode(img_path.read_bytes()).decode("ascii")
        content.append(
            {
                "type": "input_image",
                "image_url": f"data:{mime};base64,{b64}",
            }
        )
    return [{"type": "message", "role": "user", "content": content}]


class _InlineThinkSplitter:
    """Fallback splitter in case a model emits literal <think>...</think> inside text deltas."""

    def __init__(self) -> None:
        self.in_think = False
        self.buf = ""

    def feed(self, chunk: str) -> list[tuple[str, str]]:
        out: list[tuple[str, str]] = []
        self.buf += chunk
        while self.buf:
            if not self.in_think:
                idx = self.buf.find("<think>")
                if idx != -1:
                    if idx > 0:
                        out.append(("delta", self.buf[:idx]))
                    self.buf = self.buf[idx + 7 :]
                    self.in_think = True
                    continue
                keep = self._partial_tag_len(self.buf, "<think>")
                emit_len = len(self.buf) - keep
                if emit_len > 0:
                    out.append(("delta", self.buf[:emit_len]))
                    self.buf = self.buf[emit_len:]
                break
            else:
                idx = self.buf.find("</think>")
                if idx != -1:
                    if idx > 0:
                        out.append(("thinking", self.buf[:idx]))
                    self.buf = self.buf[idx + 8 :]
                    self.in_think = False
                    continue
                keep = self._partial_tag_len(self.buf, "</think>")
                emit_len = len(self.buf) - keep
                if emit_len > 0:
                    out.append(("thinking", self.buf[:emit_len]))
                    self.buf = self.buf[emit_len:]
                break
        return out

    def flush(self) -> list[tuple[str, str]]:
        if not self.buf:
            return []
        kind = "thinking" if self.in_think else "delta"
        rem = self.buf
        self.buf = ""
        return [(kind, rem)]

    @staticmethod
    def _partial_tag_len(s: str, tag: str) -> int:
        max_k = min(len(s), len(tag) - 1)
        for k in range(max_k, 0, -1):
            if s.endswith(tag[:k]):
                return k
        return 0


async def _watch_gateway_tool_events(
    *,
    token: str,
    session_key: str,
    queue: asyncio.Queue[tuple[str, Any]],
    stop_event: asyncio.Event,
) -> None:
    """
    Passive local Gateway WS sidecar observer (protocol v4 with `tool-events` cap).
    OpenClaw's HTTP `/v1/responses` wrapper strips internal `tool` events; this
    lightweight sidecar forwards live tool progress for `session_key` so users see
    every Notion/workspace action in real time instead of opaque waiting.
    Silently degrades if WS is unavailable.
    """
    try:
        import websockets  # type: ignore
    except Exception:
        return

    ws_url = _gateway_ws_url()
    seen_started: set[str] = set()
    try:
        async with websockets.connect(
            ws_url, open_timeout=3.0, close_timeout=1.5, ping_interval=20
        ) as ws:
            # 1. Read connect.challenge
            raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
            _ = json.loads(raw)

            # 2. Authenticate as read-only backend operator with tool-events cap
            await ws.send(
                json.dumps(
                    {
                        "type": "req",
                        "id": "portal-watch-1",
                        "method": "connect",
                        "params": {
                            "minProtocol": 4,
                            "maxProtocol": 4,
                            "client": {
                                "id": "gateway-client",
                                "displayName": "Donut Portal Observer",
                                "version": "1.0.0",
                                "platform": "linux",
                                "mode": "backend",
                            },
                            "caps": ["tool-events"],
                            "role": "operator",
                            "scopes": ["operator.read"],
                            "auth": {"token": token},
                        },
                    }
                )
            )
            hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=3.0))
            if not hello.get("ok"):
                return

            # 3. Stream matching agent tool events until HTTP response completes
            while not stop_event.is_set():
                try:
                    frame_raw = await asyncio.wait_for(ws.recv(), timeout=0.4)
                except asyncio.TimeoutError:
                    continue
                try:
                    frame = json.loads(frame_raw)
                except Exception:
                    continue
                if frame.get("type") != "event":
                    continue
                ev_name = frame.get("event")
                payload = frame.get("payload") or {}
                if not isinstance(payload, dict):
                    continue
                if payload.get("sessionKey") != session_key:
                    continue

                if ev_name == "agent" and payload.get("stream") == "tool":
                    data = payload.get("data") or {}
                    if not isinstance(data, dict):
                        continue
                    phase = str(data.get("phase") or "").lower()
                    name = str(
                        data.get("name")
                        or data.get("toolName")
                        or data.get("tool")
                        or ""
                    ).strip()
                    call_id = str(
                        data.get("toolCallId")
                        or data.get("callId")
                        or data.get("id")
                        or f"{name}-{len(seen_started)}"
                    )
                    if not name:
                        continue
                    if phase in ("start", "running", "input_delta"):
                        if call_id not in seen_started:
                            seen_started.add(call_id)
                            await queue.put(
                                (
                                    "ws_tool",
                                    {"id": call_id, "name": name, "status": "running"},
                                )
                            )
                    elif phase in ("result", "done", "end", "completed", "error"):
                        await queue.put(
                            (
                                "ws_tool",
                                {"id": call_id, "name": name, "status": "done"},
                            )
                        )
    except asyncio.CancelledError:
        return
    except Exception:
        # Never break the primary HTTP /v1/responses stream on sidecar error
        return


async def stream_openclaw_response(
    *,
    user_id: str,
    session_id: str,
    text: str,
    image_paths: list[Path],
    instructions: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """
    Streams normalized events from OpenClaw Gateway's POST /v1/responses,
    augmented with live internal tool progress from the local Gateway WS sidecar:
      - {"type": "thinking", "delta": "..."}
      - {"type": "tool", "id": "...", "name": "...", "status": "running"|"done"}
      - {"type": "delta", "text": "..."}
      - {"type": "done", "usage": {...}}
      - {"type": "error", "message": "..."}
    """
    agent_id = USER_AGENT_MAP.get(user_id)
    if not agent_id:
        yield {"type": "error", "message": f"No OpenClaw agent mapped for user '{user_id}'"}
        return

    token = load_openclaw_token()
    if not token:
        yield {"type": "error", "message": "OpenClaw Gateway token not configured on server"}
        return

    session_key = f"agent:{agent_id}:portal-{session_id}"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "x-openclaw-agent-id": agent_id,
        "x-openclaw-session-key": session_key,
    }
    payload: dict[str, Any] = {
        "model": f"openclaw:{agent_id}",
        "input": build_input_payload(text, image_paths),
        "stream": True,
    }
    if instructions and instructions.strip():
        payload["instructions"] = instructions.strip()

    queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
    stop_event = asyncio.Event()

    async def _http_reader() -> None:
        splitter = _InlineThinkSplitter()
        timeout = httpx.Timeout(connect=15.0, read=180.0, write=30.0, pool=15.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    f"{OPENCLAW_GATEWAY_URL}/v1/responses",
                    headers=headers,
                    json=payload,
                ) as resp:
                    if resp.status_code != 200:
                        body = (await resp.aread()).decode("utf-8", errors="replace")[:300]
                        await queue.put(
                            (
                                "http_event",
                                {
                                    "type": "error",
                                    "message": f"OpenClaw Gateway HTTP {resp.status_code}: {body}",
                                },
                            )
                        )
                        return

                    event_name = ""
                    data_lines: list[str] = []

                    async for raw_line in resp.aiter_lines():
                        line = raw_line.rstrip("\r")
                        if line == "":
                            if data_lines:
                                raw_data = "\n".join(data_lines).strip()
                                data_lines = []
                                ev = event_name
                                event_name = ""
                                if raw_data == "[DONE]":
                                    for kind, chunk in splitter.flush():
                                        if kind == "thinking":
                                            await queue.put(("http_event", {"type": "thinking", "delta": chunk}))
                                        else:
                                            await queue.put(("http_event", {"type": "delta", "text": chunk}))
                                    break
                                try:
                                    parsed = json.loads(raw_data)
                                except json.JSONDecodeError:
                                    continue

                                ev_type = parsed.get("type") or ev

                                if ev_type == "response.output_text.delta":
                                    delta = parsed.get("delta") or ""
                                    if delta:
                                        for kind, chunk in splitter.feed(delta):
                                            if kind == "thinking":
                                                await queue.put(("http_event", {"type": "thinking", "delta": chunk}))
                                            else:
                                                await queue.put(("http_event", {"type": "delta", "text": chunk}))

                                elif ev_type in (
                                    "response.reasoning.delta",
                                    "response.reasoning_text.delta",
                                    "response.reasoning_summary_text.delta",
                                ):
                                    delta = parsed.get("delta") or ""
                                    if delta:
                                        await queue.put(("http_event", {"type": "thinking", "delta": delta}))

                                elif ev_type == "response.output_item.added":
                                    item = parsed.get("item") or {}
                                    itype = item.get("type", "")
                                    if itype in ("function_call", "mcp_call", "web_search_call", "tool_call"):
                                        await queue.put(
                                            (
                                                "http_event",
                                                {
                                                    "type": "tool",
                                                    "id": item.get("call_id") or item.get("id") or itype,
                                                    "name": item.get("name") or item.get("server_label") or itype,
                                                    "status": "running",
                                                },
                                            )
                                        )
                                    elif itype == "message":
                                        await queue.put(("http_boundary", None))

                                elif ev_type == "response.output_item.done":
                                    item = parsed.get("item") or {}
                                    itype = item.get("type", "")
                                    if itype in ("function_call", "mcp_call", "web_search_call", "tool_call"):
                                        await queue.put(
                                            (
                                                "http_event",
                                                {
                                                    "type": "tool",
                                                    "id": item.get("call_id") or item.get("id") or itype,
                                                    "name": item.get("name") or item.get("server_label") or itype,
                                                    "status": "done",
                                                },
                                            )
                                        )
                                    elif itype == "message":
                                        await queue.put(("http_boundary", None))

                                elif ev_type == "response.completed":
                                    for kind, chunk in splitter.flush():
                                        if kind == "thinking":
                                            await queue.put(("http_event", {"type": "thinking", "delta": chunk}))
                                        else:
                                            await queue.put(("http_event", {"type": "delta", "text": chunk}))
                                    usage = (parsed.get("response") or {}).get("usage") or {}
                                    await queue.put(("http_event", {"type": "done", "usage": usage}))

                                elif ev_type in ("response.failed", "error"):
                                    err_obj = (
                                        (parsed.get("response") or {}).get("error")
                                        or parsed.get("error")
                                        or {}
                                    )
                                    msg = err_obj.get("message") or "OpenClaw response failed"
                                    await queue.put(("http_event", {"type": "error", "message": msg}))
                        elif line.startswith("event:"):
                            event_name = line[6:].strip()
                        elif line.startswith("data:"):
                            data_lines.append(line[5:].lstrip())
        except httpx.ConnectError:
            await queue.put(
                (
                    "http_event",
                    {"type": "error", "message": "无法连接到 OpenClaw Gateway，请确认后台服务已启动。"},
                )
            )
        except Exception as exc:
            await queue.put(("http_event", {"type": "error", "message": f"流式连接中断: {exc}"}))
        finally:
            await queue.put(("http_eof", None))

    ws_task = asyncio.create_task(
        _watch_gateway_tool_events(
            token=token,
            session_key=session_key,
            queue=queue,
            stop_event=stop_event,
        )
    )
    http_task = asyncio.create_task(_http_reader())

    emitted_text_any = False
    need_bubble_break = False

    try:
        while True:
            kind, data = await queue.get()
            if kind == "http_eof":
                break
            elif kind == "ws_tool":
                if emitted_text_any:
                    need_bubble_break = True
                yield {"type": "tool", **data}
            elif kind == "http_boundary":
                if emitted_text_any:
                    need_bubble_break = True
            elif kind == "http_event":
                ev_type = data.get("type")
                if ev_type == "delta":
                    chunk = data.get("text") or ""
                    if not chunk:
                        continue
                    if need_bubble_break and emitted_text_any:
                        need_bubble_break = False
                        chunk = chunk.lstrip("\n")
                        if chunk:
                            yield {"type": "delta", "text": BUBBLE_BREAK_MARKER + chunk}
                            emitted_text_any = True
                        continue
                    emitted_text_any = True
                    yield data
                elif ev_type in ("tool", "thinking"):
                    if emitted_text_any:
                        need_bubble_break = True
                    yield data
                else:
                    yield data
    finally:
        stop_event.set()
        for task in (http_task, ws_task):
            if not task.done():
                task.cancel()
        await asyncio.gather(http_task, ws_task, return_exceptions=True)


async def run_openclaw_once(
    *,
    user_id: str,
    session_key_suffix: str,
    prompt: str,
    instructions: str | None = None,
) -> str:
    """Run a single non-streaming turn against the user's isolated OpenClaw agent."""
    agent_id = USER_AGENT_MAP.get(user_id)
    if not agent_id:
        raise RuntimeError(f"No OpenClaw agent mapped for user '{user_id}'")
    token = load_openclaw_token()
    if not token:
        raise RuntimeError("OpenClaw Gateway token not configured")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "x-openclaw-agent-id": agent_id,
        "x-openclaw-session-key": f"agent:{agent_id}:{session_key_suffix}",
    }
    payload: dict[str, Any] = {
        "model": f"openclaw:{agent_id}",
        "input": prompt,
        "stream": False,
    }
    if instructions and instructions.strip():
        payload["instructions"] = instructions.strip()

    timeout = httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{OPENCLAW_GATEWAY_URL}/v1/responses",
            headers=headers,
            json=payload,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"OpenClaw HTTP {resp.status_code}: {resp.text[:240]}")
        data = resp.json()

    chunks: list[str] = []
    for item in data.get("output", []):
        if item.get("type") == "message":
            for part in item.get("content", []):
                if part.get("type") in ("output_text", "text") and part.get("text"):
                    chunks.append(str(part["text"]))
    return "".join(chunks).strip()
