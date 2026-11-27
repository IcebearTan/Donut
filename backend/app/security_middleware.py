"""CSRF origin validation for mutating API calls + defensive response headers."""
from __future__ import annotations

import os
from urllib.parse import urlsplit

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
PROTECTED_PATH_PREFIX = "/portal-api/"
# Pre-ICP: the site is reached via the raw IP and a reverse proxy may rewrite the Host header,
# so the public origins are pinned here. PORTAL_ALLOWED_ORIGINS (comma-separated) adds more.
DEFAULT_ALLOWED_ORIGINS = (
    "https://icebear-yearning.fun",
    "http://43.139.111.113:8443",
    "http://localhost:5173",
    "http://127.0.0.1:8081",
    "http://localhost:5175",  # frontend/vite.config.ts dev server
)
DEFENSIVE_HEADERS = (
    ("x-content-type-options", "nosniff"),
    ("referrer-policy", "no-referrer"),
)
FORBIDDEN_BODY = b'{"detail":"Forbidden origin"}'
_REJECT_HEADERS = [
    (b"content-type", b"application/json"),
    (b"content-length", str(len(FORBIDDEN_BODY)).encode("latin-1")),
    *((k.encode("latin-1"), v.encode("latin-1")) for k, v in DEFENSIVE_HEADERS),
]


def parse_origins(value: str) -> frozenset[str]:
    """Normalise a comma-separated origin list to lowercase ``scheme://host[:port]`` strings."""
    return frozenset(
        origin for item in value.split(",") if (origin := item.strip().rstrip("/").lower())
    )


def load_allowed_origins() -> frozenset[str]:
    """Built-in defaults plus PORTAL_ALLOWED_ORIGINS (comma-separated, additive)."""
    return parse_origins(",".join(DEFAULT_ALLOWED_ORIGINS)) | parse_origins(
        os.environ.get("PORTAL_ALLOWED_ORIGINS", "")
    )


ALLOWED_ORIGINS = load_allowed_origins()


def origin_allowed(value: str, host: str, allowed: frozenset[str]) -> bool:
    """True when ``value`` (an Origin header or a Referer URL) is the request's own
    scheme://host or an allowlisted origin. Opaque ("null") origins never match."""
    try:
        parts = urlsplit(value)
    except ValueError:  # malformed URL, e.g. a broken IPv6 literal
        return False
    origin = f"{parts.scheme}://{parts.netloc}".lower()
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return False
    host = host.strip().lower()
    same_host = {f"http://{host}", f"https://{host}"} if host else set()
    return origin in allowed or origin in same_host


def _is_protected(scope: Scope) -> bool:
    method, path = scope["method"].upper(), scope["path"]
    return method in MUTATING_METHODS and path.startswith(PROTECTED_PATH_PREFIX)


def _hardened(send: Send) -> Send:
    """Wrap ``send`` so every response start carries the defensive headers."""

    async def send_with_headers(message: Message) -> None:
        if message["type"] == "http.response.start":
            headers = MutableHeaders(scope=message)
            for name, value in DEFENSIVE_HEADERS:
                headers[name] = value
        await send(message)

    return send_with_headers


async def _reject(send: Send) -> None:
    await send({"type": "http.response.start", "status": 403, "headers": list(_REJECT_HEADERS)})
    await send({"type": "http.response.body", "body": FORBIDDEN_BODY})


class SecurityMiddleware:
    """Pure-ASGI middleware: request bodies are never read or buffered, so SSE is untouched."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if _is_protected(scope) and not self._origin_trusted(scope):
            await _reject(send)
            return
        await self.app(scope, receive, _hardened(send))

    def _origin_trusted(self, scope: Scope) -> bool:
        headers = Headers(scope=scope)
        origin = headers.get("origin") or headers.get("referer")
        if not origin:
            # Browsers always send Origin on unsafe requests, so this is a non-browser client.
            return True
        return origin_allowed(origin, headers.get("host", ""), ALLOWED_ORIGINS)
