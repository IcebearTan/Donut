from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any, AsyncIterator

import httpx

from .config import OPENCLAW_GATEWAY_URL, USER_AGENT_MAP, load_openclaw_token


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
                # Hold partial tag prefix at end
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


async def stream_openclaw_response(
    *,
    user_id: str,
    session_id: str,
    text: str,
    image_paths: list[Path],
    instructions: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """
    Streams normalized events from OpenClaw Gateway's POST /v1/responses:
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
                    yield {
                        "type": "error",
                        "message": f"OpenClaw Gateway HTTP {resp.status_code}: {body}",
                    }
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
                                        yield {"type": "thinking", "delta": chunk}
                                    else:
                                        yield {"type": "delta", "text": chunk}
                                break
                            try:
                                parsed = json.loads(raw_data)
                            except json.JSONDecodeError:
                                continue

                            ev_type = parsed.get("type") or ev

                            # 1. Text delta
                            if ev_type == "response.output_text.delta":
                                delta = parsed.get("delta") or ""
                                if delta:
                                    for kind, chunk in splitter.feed(delta):
                                        if kind == "thinking":
                                            yield {"type": "thinking", "delta": chunk}
                                        else:
                                            yield {"type": "delta", "text": chunk}

                            # 2. Reasoning / thinking deltas
                            elif ev_type in (
                                "response.reasoning.delta",
                                "response.reasoning_text.delta",
                                "response.reasoning_summary_text.delta",
                            ):
                                delta = parsed.get("delta") or ""
                                if delta:
                                    yield {"type": "thinking", "delta": delta}

                            # 3. Output item added (tool calls / reasoning start)
                            elif ev_type == "response.output_item.added":
                                item = parsed.get("item") or {}
                                itype = item.get("type", "")
                                if itype in (
                                    "function_call",
                                    "mcp_call",
                                    "web_search_call",
                                    "tool_call",
                                ):
                                    yield {
                                        "type": "tool",
                                        "id": item.get("call_id") or item.get("id") or itype,
                                        "name": item.get("name") or item.get("server_label") or itype,
                                        "status": "running",
                                    }

                            # 4. Output item completed (tool calls finished / reasoning summary)
                            elif ev_type == "response.output_item.done":
                                item = parsed.get("item") or {}
                                itype = item.get("type", "")
                                if itype in (
                                    "function_call",
                                    "mcp_call",
                                    "web_search_call",
                                    "tool_call",
                                ):
                                    yield {
                                        "type": "tool",
                                        "id": item.get("call_id") or item.get("id") or itype,
                                        "name": item.get("name") or item.get("server_label") or itype,
                                        "status": "done",
                                    }

                            # 5. Completed
                            elif ev_type == "response.completed":
                                for kind, chunk in splitter.flush():
                                    if kind == "thinking":
                                        yield {"type": "thinking", "delta": chunk}
                                    else:
                                        yield {"type": "delta", "text": chunk}
                                usage = (parsed.get("response") or {}).get("usage") or {}
                                yield {"type": "done", "usage": usage}

                            # 6. Failed
                            elif ev_type in ("response.failed", "error"):
                                err_obj = (
                                    (parsed.get("response") or {}).get("error")
                                    or parsed.get("error")
                                    or {}
                                )
                                msg = err_obj.get("message") or "OpenClaw response failed"
                                yield {"type": "error", "message": msg}
                    elif line.startswith("event:"):
                        event_name = line[6:].strip()
                    elif line.startswith("data:"):
                        data_lines.append(line[5:].lstrip())
    except httpx.ConnectError:
        yield {
            "type": "error",
            "message": "无法连接到 OpenClaw Gateway，请确认后台服务已启动。",
        }
    except Exception as exc:
        yield {"type": "error", "message": f"流式连接中断: {exc}"}


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
