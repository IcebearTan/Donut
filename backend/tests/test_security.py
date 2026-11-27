"""Stage 1 security tests: session tokens, token_version revocation, throttling, CSRF.
Drives routes and the raw ASGI app directly (no TestClient/httpx); needs the backend virtualenv."""
import asyncio
import base64
import json
import os
import sys
import tempfile
import unittest
from http.cookies import SimpleCookie
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# app.config creates its data dir on import: keep it out of the repo and away from real dev data.
os.environ["PORTAL_DATA_DIR"] = os.path.join(tempfile.gettempdir(), "portal-test-data")

from fastapi import HTTPException  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from starlette.datastructures import Headers  # noqa: E402
from starlette.requests import Request  # noqa: E402
from starlette.responses import Response  # noqa: E402
from app import auth, db, main, rate_limit, security_middleware as mw  # noqa: E402

PASSWORD, NEW_PASSWORD = "correct-horse-9", "brand-new-pass-1"
LOCKED = (429, "尝试次数过多，请稍后再试", "900")  # status, detail, Retry-After
T0, TTL = 1_800_000_000_000, auth.COOKIE_MAX_AGE * 1000  # fixed epoch ms, token lifetime ms


def _request(ip="203.0.113.7") -> Request:
    return Request({"type": "http", "headers": [], "client": (ip, 0)})


def _call_asgi(app, method="POST", path="/portal-api/auth/login", body=b"", **headers):
    """Drive an ASGI app by hand -> (status, response headers, body bytes)."""
    sent = []
    raw = [(k.encode(), v.encode("latin-1")) for k, v in {"host": "portal.test", **headers}.items()]
    scope = {"type": "http", "method": method, "path": path, "root_path": "", "query_string": b"", "headers": raw}

    async def run():
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}
        async def send(message):
            sent.append(message)
        await app(scope, receive, send)

    asyncio.run(run())
    start, *rest = sent
    return start["status"], Headers(raw=start["headers"]), b"".join(m.get("body", b"") for m in rest)


def _call(fn, **kwargs):
    """Call an auth route directly -> (status, session token | the HTTPException raised)."""
    response = Response()
    try:
        fn(response=response, **kwargs)
    except HTTPException as exc:
        return exc.status_code, exc
    jar = SimpleCookie()
    jar.load(response.headers["set-cookie"])
    return 200, jar[auth.COOKIE_NAME].value


def _login(name, password, ip="203.0.113.7"):
    body = main.LoginRequest(name=name, password=password)
    return _call(main.login, body=body, request=_request(ip))


def _change_password(user, current):
    body = main.PasswordChangeRequest(current_password=current, new_password=NEW_PASSWORD)
    return _call(main.change_password, body=body, request=_request(), user=user)


class _DbCase(unittest.TestCase):
    """A fresh SQLite file with two users, plus fresh limiters on a fake clock, per test."""

    @classmethod
    def setUpClass(cls):
        tmp = cls.enterClassContext(tempfile.TemporaryDirectory(prefix="portal-test-db-"))
        cls.enterClassContext(mock.patch.object(db, "DB_PATH", Path(tmp) / "test.db"))
        db.init_db()
        with mock.patch.object(auth, "DEFAULT_SEED_USERS", f"bear:{PASSWORD}:小熊,her:{PASSWORD}:她"):
            auth.seed_users()

    def setUp(self):
        self.now = 1_000_000.0  # the fake clock every limiter below runs on
        for name in ("login_ip_limiter", "login_account_limiter", "password_limiter"):
            limiter = rate_limit.SlidingWindowLimiter(clock=lambda: self.now)
            self.enterContext(mock.patch.object(main, name, limiter))


class TokenTests(unittest.TestCase):
    @staticmethod
    def _legacy(payload):  # a token exactly as the pre-expiry code issued it (no "exp"/"ver")
        b64 = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
        return f"{b64}.{auth._sign(b64)}"

    def test_expiry(self):
        legacy = self._legacy({"uid": "bear", "iat": T0})
        with mock.patch.object(auth, "now_ms", return_value=T0):
            token = auth.create_session_token("bear", 4)
        # valid up to and including exp; legacy tokens are capped by iat + max age
        for offset, expected in ((TTL, [("bear", 4), ("bear", 1)]), (TTL + 1, [None, None])):
            now = mock.patch.object(auth, "now_ms", return_value=T0 + offset)
            with self.subTest(offset=offset), now:
                self.assertEqual([auth.verify_session_token(t) for t in (token, legacy)], expected)

    def test_tampered_or_malformed_tokens_fail_closed(self):
        token = auth.create_session_token("bear")
        bad = [None, "", "no-dot", token + "é", token[:-1] + ("A" if token[-1] != "A" else "B"),
               self._legacy({"uid": "bear", "iat": "yesterday"}), self._legacy({"uid": "bear", "exp": 1}),
               self._legacy({"uid": "bear", "iat": T0, "exp": None}), self._legacy([1, 2])]
        self.assertEqual([auth.verify_session_token(c) for c in bad], [None] * len(bad))


class RevocationTests(_DbCase):
    def test_password_change_keeps_this_device_and_revokes_the_others(self):
        phone, laptop = _login("bear", PASSWORD)[1], _login("小熊", PASSWORD)[1]
        with self.assertRaises(ValidationError):  # new password must be at least 8 characters
            main.PasswordChangeRequest(current_password=PASSWORD, new_password="x" * 7)
        status, fresh = _change_password(auth.get_current_user(phone), PASSWORD)
        self.assertEqual((status, auth.verify_session_token(fresh)), (200, ("bear", 2)))
        self.assertEqual(tuple(auth.get_current_user(fresh)), auth.USER_PUBLIC_FIELDS)  # no leak
        for stale in (phone, laptop):
            with self.subTest(stale=stale), self.assertRaises(HTTPException) as ctx:
                auth.get_current_user(stale)
            self.assertEqual((ctx.exception.status_code, ctx.exception.detail), (401, "Session revoked"))
        self.assertEqual((_login("bear", PASSWORD)[0], _login("bear", NEW_PASSWORD)[0]), (401, 200))

    def test_logout_all_revokes_every_cookie(self):
        cookie = _login("her", PASSWORD)[1]
        status, cleared = _call(main.logout_all, user=auth.get_current_user(cookie))
        self.assertEqual((status, cleared.strip('"')), (200, ""))  # ok, and the cookie is emptied
        with self.assertRaises(HTTPException):
            auth.get_current_user(cookie)
        self.assertEqual(auth.verify_session_token(_login("her", PASSWORD)[1]), ("her", 2))  # re-login

    def test_migration_adds_token_version_to_an_existing_database(self):
        legacy = Path(self.enterContext(tempfile.TemporaryDirectory())) / "legacy.db"
        self.enterContext(mock.patch.object(db, "DB_PATH", legacy))
        with db.db_session() as conn:  # a users table from before this release
            conn.executescript("CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL,"
                               " pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL);"
                               " INSERT INTO users VALUES ('bear', '小熊', 'h', 1);")
        db.init_db()
        with db.db_session() as conn:
            column = {r["name"]: r for r in conn.execute("PRAGMA table_info(users)")}["token_version"]
            version = conn.execute("SELECT token_version FROM users").fetchone()[0]
        self.assertEqual((column["type"], column["notnull"], column["dflt_value"], version),
                         ("INTEGER", 1, "1", 1))


class ThrottleTests(_DbCase):
    def test_limiter_locks_after_five_failures_in_window_then_starts_fresh(self):
        self.now, limiter = 0.0, rate_limit.SlidingWindowLimiter(clock=lambda: self.now)
        self.assertEqual([limiter.record_failure("k") for _ in range(4)], [False] * 4)
        self.now = 299.0
        self.assertTrue(limiter.record_failure("k"))  # the fifth failure inside the 300s window
        self.assertEqual((limiter.check_allowed("k"), limiter.retry_after("k")), (False, 900))  # 900s lock
        self.now = 1200.0  # the 900s lock ended; the window starts from scratch
        self.assertEqual([limiter.record_failure("k") for _ in range(4)], [False] * 4)
        limiter.reset("k")
        self.assertEqual([limiter.record_failure("k") for _ in range(4)], [False] * 4)  # from zero

    def test_login_locks_after_five_failures_even_for_the_right_password(self):
        self.assertEqual([_login("bear", "wrong-pass")[0] for _ in range(4)], [401] * 4)
        self.assertEqual(_login("bear", PASSWORD)[0], 200)  # a successful login resets the counters
        self.assertEqual([_login("bear", "wrong-pass")[0] for _ in range(5)], [401] * 5)
        blocked = _login("bear", PASSWORD)[1]  # the right password, but the account is locked
        self.assertEqual((blocked.status_code, blocked.detail, blocked.headers["Retry-After"]), LOCKED)
        self.assertEqual(_login("her", PASSWORD)[0], 429)  # the IP bucket is locked as well
        self.now += 900
        self.assertEqual(_login("bear", PASSWORD)[0], 200)  # lock lifted

    def test_account_lock_spans_ips_and_both_login_aliases(self):
        for attempt in range(5):  # five wrong tries, each from another IP, via both login aliases
            name = "小熊" if attempt % 2 else "bear"
            self.assertEqual(_login(name, "wrong-pass", ip=f"198.51.100.{attempt}")[0], 401)
        self.assertEqual(_login("小熊", PASSWORD, ip="198.51.100.99")[0], 429)  # right password

    def test_wrong_current_password_is_throttled(self):
        user = auth.get_current_user(_login("her", PASSWORD)[1])
        self.assertEqual([_change_password(user, "wrong-pass")[0] for _ in range(5)], [400] * 5)
        blocked = _change_password(user, PASSWORD)[1]
        self.assertEqual((blocked.status_code, blocked.detail, blocked.headers["Retry-After"]), LOCKED)


class CsrfMiddlewareTests(_DbCase):
    EVIL = {"origin": "https://evil.example"}

    @staticmethod
    async def _ok(scope, receive, send):  # stands in for the app: answers 204 whenever reached
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    def test_origin_rules(self):
        cases = [  # (method, request headers) -> status for calls under /portal-api/
            *((method, self.EVIL, 403) for method in ("POST", "PUT", "PATCH", "DELETE")),
            ("POST", {"origin": "null"}, 403),  # opaque origin
            ("POST", {"referer": "https://evil.example/"}, 403),
            ("POST", {"origin": "http://portal.test"}, 204),  # same host
            ("POST", {"origin": "http://43.139.111.113:8443"}, 204),  # allowlisted; proxy rewrote Host
            ("POST", {"origin": "https://icebear-yearning.fun"}, 204),
            ("POST", {"referer": "https://portal.test/settings"}, 204),  # Referer fallback
            ("POST", {}, 204),  # no browser headers: a non-browser client
        ]
        for method, headers, expected in cases:  # the 403 body is checked on the real app below
            with self.subTest(method=method, headers=headers):
                status, out, _ = _call_asgi(mw.SecurityMiddleware(self._ok), method, **headers)
                self.assertEqual(status, expected)
                hardened = (out["x-content-type-options"], out["referrer-policy"])
                self.assertEqual(hardened, ("nosniff", "no-referrer"))  # forced on every response

    def test_middleware_is_wired_into_the_real_app(self):
        status, _, body = _call_asgi(main.app, **self.EVIL)
        self.assertEqual((status, json.loads(body)), (403, {"detail": "Forbidden origin"}))
        same = {"origin": "http://portal.test", "content-type": "application/json"}
        payload = json.dumps({"name": "bear", "password": "wrong-pass"}).encode()
        status, out, _ = _call_asgi(main.app, body=payload, **same)
        self.assertEqual((status, out["x-content-type-options"]), (401, "nosniff"))  # reached login
