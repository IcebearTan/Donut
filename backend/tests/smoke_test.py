"""Stdlib unittest smoke suite for Portal auth, CSRF, user isolation, compaction, and official CLI tools."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_TMP = tempfile.TemporaryDirectory()
os.environ["PORTAL_DATA_DIR"] = _TMP.name
os.environ["OPENCLAW_HOME"] = _TMP.name
os.environ["PORTAL_SEED_USERS"] = "bear:pass1234:小熊,her:pass5678:她"

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PORTAL_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # noqa: E402
from app import db, main, session_lifecycle  # noqa: E402


class PortalSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client_ctx = TestClient(main.app)
        cls.client = cls.client_ctx.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_ctx.__exit__(None, None, None)
        _TMP.cleanup()

    def _login(self, account: str, password: str) -> TestClient:
        c = TestClient(main.app)
        r = c.post("/portal-api/auth/login", json={"name": account, "password": password})
        self.assertEqual(r.status_code, 200, r.text)
        return c

    def test_01_csrf_origin_blocked(self) -> None:
        r = self.client.post(
            "/portal-api/auth/login",
            json={"name": "bear", "password": "pass1234"},
            headers={"Origin": "https://evil.example"},
        )
        self.assertEqual(r.status_code, 403)

    def test_02_logout_all_revokes_previous_cookies(self) -> None:
        c1 = self._login("bear", "pass1234")
        c2 = self._login("bear", "pass1234")
        self.assertEqual(c1.get("/portal-api/auth/me").status_code, 200)
        self.assertEqual(c2.post("/portal-api/auth/logout-all").status_code, 200)
        self.assertEqual(c1.get("/portal-api/auth/me").status_code, 401)
        self.assertEqual(c2.get("/portal-api/auth/me").status_code, 401)

    def test_03_cross_user_isolation_sessions_projects_vault(self) -> None:
        bear = self._login("bear", "pass1234")
        her = self._login("her", "pass5678")

        proj = bear.post("/portal-api/projects", json={"name": "秘密计划"}).json()["project"]
        sess = bear.post("/portal-api/sessions", json={"title": "私密对话", "project_id": proj["id"]}).json()["session"]
        up = bear.post(
            "/portal-api/vault/upload",
            files={"file": ("secret.txt", b"bear-only-content", "text/plain")},
        )
        self.assertEqual(up.status_code, 200, up.text)
        fname = up.json()["id"]

        self.assertEqual(her.get(f"/portal-api/projects/{proj['id']}").status_code, 404)
        self.assertEqual(her.get(f"/portal-api/sessions/{sess['id']}/messages").status_code, 404)
        self.assertEqual(her.get(f"/portal-api/vault/download/inbox/{fname}").status_code, 404)
        self.assertEqual(bear.get(f"/portal-api/vault/download/inbox/{fname}").status_code, 200)

    def test_04_session_compaction_rollover_and_carryover(self) -> None:
        bear = self._login("bear", "pass1234")
        sess = bear.post("/portal-api/sessions", json={"title": "长对话"}).json()["session"]
        sid = sess["id"]
        ts = db.now_ms()
        with db.db_session() as conn:
            conn.execute(
                "INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)",
                ("u1", sid, "周末准备去爬山", ts + 1),
            )
            conn.execute(
                "INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)",
                ("a1", sid, "好的，记得带防风外套。", ts + 2),
            )

        async def _fake_distill(**_kwargs: object) -> str:
            return "- 计划：周末去爬山，需带防风外套"

        deleted: list[tuple[str, list[str]]] = []
        with mock.patch.object(session_lifecycle, "run_openclaw_once", side_effect=_fake_distill), \
             mock.patch.object(session_lifecycle, "_delete_keys_bg", side_effect=lambda a, k: deleted.append((a, k))):
            resp = bear.post(f"/portal-api/sessions/{sid}/compact")

        self.assertEqual(resp.status_code, 200, resp.text)
        body = resp.json()
        self.assertEqual(body["context_gen"], 2)
        self.assertIn("爬山", session_lifecycle.consume_carryover_context("bear", sid))
        self.assertEqual(session_lifecycle.consume_carryover_context("bear", sid), "")
        self.assertTrue(deleted and f"agent:main:portal-{sid}" in deleted[0][1])

    def test_05_official_workbench_cli_roundtrip(self) -> None:
        tools_dir = PORTAL_ROOT / "openclaw-skills" / "workbench-builder" / "tools"
        with tempfile.TemporaryDirectory() as ws_tmp:
            ws = Path(ws_tmp)
            (ws / "vault" / "workbench").mkdir(parents=True)
            env = {**os.environ, "OPENCLAW_WORKSPACE": str(ws)}

            def run_tool(name: str, *args: str) -> dict:
                r = subprocess.run(
                    [sys.executable, str(tools_dir / name), "--vault-dir", str(ws / "vault"), *args],
                    cwd=ws_tmp,
                    env=env,
                    capture_output=True,
                    text=True,
                    check=True,
                )
                return json.loads(r.stdout)

            # Focus CLI add -> list -> delete
            added = run_tool("focus_sync.py", "add", "--title", "验收单测", "--urgency", "must")
            fid = added["item"]["id"]
            self.assertEqual(len(run_tool("focus_sync.py", "list")["items"]), 1)
            run_tool("focus_sync.py", "delete", fid)
            self.assertEqual(len(run_tool("focus_sync.py", "list")["items"]), 0)

            # Ledger CLI add -> list
            led = run_tool("ledger_entry.py", "add", "--amount", "32.5", "--merchant", "咖啡馆")
            self.assertTrue(led["ok"])
            self.assertEqual(len(run_tool("ledger_entry.py", "list")["items"]), 1)

            # Reimbursement CLI add -> list
            reimb = run_tool("reimbursement_cli.py", "add", "--title", "打车报销", "--amount", "45.0", "--platform", "滴滴")
            self.assertTrue(reimb["ok"])
            self.assertEqual(len(run_tool("reimbursement_cli.py", "list")["items"]), 1)


if __name__ == "__main__":
    unittest.main()
