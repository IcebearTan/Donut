"""Login / password throttling for a small single-process deployment.

State is in-memory only (per worker process) and keys never contain passwords.
"""
from __future__ import annotations

import ipaddress
import math
import threading
import time
from typing import Callable

from fastapi import HTTPException
from starlette.requests import Request

MAX_FAILURES = 5  # this many failures ...
WINDOW_SECONDS = 300.0  # ... within this sliding window ...
LOCK_SECONDS = 900.0  # ... lock the key for this long
MAX_TRACKED_KEYS = 10_000  # hard memory cap for the 2 vCPU / 4 GB host
LOCK_MESSAGE = "尝试次数过多，请稍后再试"
_LOOPBACK_PROXIES = {"127.0.0.1", "::1"}


class SlidingWindowLimiter:
    """Thread-safe sliding-window failure limiter.

    ``max_failures`` failures inside ``window`` seconds lock a key for ``lock`` seconds.
    At most ``max_keys`` keys are tracked; once the table is full, brand-new keys are not
    counted but every key already tracked stays enforced.
    """

    def __init__(
        self,
        max_failures: int = MAX_FAILURES,
        window: float = WINDOW_SECONDS,
        lock: float = LOCK_SECONDS,
        max_keys: int = MAX_TRACKED_KEYS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_failures = max_failures
        self.window = window
        self.lock = lock
        self.max_keys = max_keys
        self._clock = clock
        self._mutex = threading.Lock()
        self._failures: dict[str, list[float]] = {}
        self._locked_until: dict[str, float] = {}
        self._next_sweep = float("-inf")

    def check_allowed(self, key: str) -> bool:
        with self._mutex:
            return self._locked_until.get(key, 0.0) <= self._clock()

    def retry_after(self, key: str) -> int:
        """Seconds until the lock on ``key`` ends (0 when it is not locked)."""
        with self._mutex:
            return max(0, math.ceil(self._locked_until.get(key, 0.0) - self._clock()))

    def locked_error(self, key: str) -> HTTPException:
        return HTTPException(
            status_code=429,
            detail=LOCK_MESSAGE,
            headers={"Retry-After": str(self.retry_after(key))},
        )

    def record_failure(self, key: str) -> bool:
        """Count one failure for ``key``. Returns True when this failure locked it."""
        with self._mutex:
            now = self._clock()
            self._sweep(now, forced=self._is_full())
            if self._locked_until.get(key, 0.0) > now:
                return False
            if key not in self._failures and self._is_full():
                return False
            cutoff = now - self.window
            bucket = [ts for ts in self._failures.get(key, ()) if ts > cutoff]
            bucket.append(now)
            if len(bucket) < self.max_failures:
                self._failures[key] = bucket
                return False
            self._failures.pop(key, None)
            self._locked_until[key] = now + self.lock
            return True

    def reset(self, key: str) -> None:
        """Forget all failures and any lock (after a successful authentication)."""
        with self._mutex:
            self._failures.pop(key, None)
            self._locked_until.pop(key, None)

    def _is_full(self) -> bool:
        return len(self._failures) + len(self._locked_until) >= self.max_keys

    def _sweep(self, now: float, forced: bool = False) -> None:
        """Drop expired entries (periodically, or when the table is full) to bound memory."""
        if not forced and now < self._next_sweep:
            return
        self._next_sweep = now + self.window
        cutoff = now - self.window
        self._failures = {k: b for k, b in self._failures.items() if b[-1] > cutoff}
        self._locked_until = {k: t for k, t in self._locked_until.items() if t > now}


def extract_client_ip(request: Request) -> str:
    """Best-effort client IP used as a throttle key.

    X-Forwarded-For is honoured only when the peer is loopback (our own reverse proxy), and
    only its last hop (the one that proxy appends), so a direct caller cannot dodge the
    limiter by sending a fake X-Forwarded-For.
    """
    peer = request.client.host if request.client else ""
    if peer in _LOOPBACK_PROXIES:
        candidate = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
        try:
            return str(ipaddress.ip_address(candidate))
        except ValueError:
            return peer
    return peer or "unknown"
