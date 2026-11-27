"""Stage 2 ledger tests: isolation, quick text, PII, bill import/dedup, export, wipe, OCR, summary CLI.
Drives services and routes directly (no TestClient); needs the backend virtualenv.
All data goes to a throwaway temp vault; the real vault is never touched."""
import asyncio
import csv
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["PORTAL_DATA_DIR"] = os.path.join(tempfile.gettempdir(), "portal-test-data")

from fastapi import HTTPException  # noqa: E402
from PIL import Image  # noqa: E402
from starlette.requests import Request  # noqa: E402
from app import workbench_ledger as ledger  # noqa: E402
from app import workbench_ledger_import as imp  # noqa: E402
from app import workbench_ledger_ocr as ocr  # noqa: E402
from app import workbench_ledger_routes as routes  # noqa: E402
from app import workbench_modules  # noqa: E402

TOOLS = Path(__file__).resolve().parents[2] / "openclaw-skills" / "workbench-builder" / "tools"
WX_HEADER = "交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注"
WECHAT_CSV = "\n".join([
    "微信支付账单明细,,,,,,,",
    WX_HEADER,
    "2026-11-20 12:30:45,商户消费,瑞幸咖啡（上海）有限公司,拿铁,支出,¥16.90,零钱,支付成功,4200001234567890123456,1001,",
    "2026-11-20 13:00:00,商户消费,滴滴出行,快车,支出,¥38.00,零钱,已全额退款,4200001234567890123457,1002,",
    "2026-11-21 09:00:00,零钱通转入,零钱通,/,支出,¥500.00,零钱,已存入零钱,4200001234567890123458,,",
    "2026-11-21 10:00:00,微信红包,王小明,红包,收入,¥8.88,/,已存入零钱,4200001234567890123459,,",
    "2026-11-22 08:00:00,商户消费,盒马鲜生,生鲜,支出,¥96.40,招商银行(尾号1234),支付成功,4200001234567890123460,1003,",
]) + "\n"
ALIPAY_CSV = "\n".join([
    "姓名：王小明,,,,,,,,,,,",
    "起始时间：[2026-11-01 00:00:00]  终止时间：[2026-11-30 23:59:59],,,,,,,,,,,",
    "---------------------------------交易记录明细列表------------------------------------",
    "交易创建时间,付款时间,交易来源,类型,交易对方,商品名称,金额（元）,收/支,交易状态,交易订单号,商家订单号,备注",
    '"2026-11-23 12:10:00","2026-11-23 12:10:03","支付宝","即时到账交易","海底捞火锅","朋友聚餐","258.00","支出","交易成功","2026112322001234567890","2026112322001234567890","周三聚餐"',
    '"2026-11-23 18:00:00","2026-11-23 18:00:02","支付宝","即时到账交易","瑞幸咖啡（上海）有限公司","拿铁","16.90","支出","退款成功","2026112322001234567891","2026112322001234567891","已退款"',
    '"2026-11-24 09:00:00","2026-11-24 09:00:00","支付宝","余额宝","余额宝","余额宝-转入","1000.00","不计收支","交易成功","2026112422001234567892","",""',
    '"2026-11-24 10:00:00","2026-11-24 10:00:00","支付宝","即时到账交易","京东商城","洗衣液","79.90","支出","交易成功","2026112322001234567893","2026112322001234567893",""',
]) + "\n"
ALIPAY_TABBED = (  # Alipay app export: tab-separated fields, comma only before the trailing 备注
    "支付宝交易记录明细\n交易创建时间\t付款时间\t交易对方\t商品名称\t金额（元）\t收/支\t交易状态\t交易订单号\t,备注\n"
    "2026-11-25 12:00:00\t2026-11-25 12:00:00\t滴滴出行\t快车\t38.00\t支出\t交易成功\t2026112522001234\t,打车\n"
)
SKIPS = {"refund": 0, "transfer": 0, "income": 0, "neutral": 0, "invalid": 0}
CONTENT_TYPE = "multipart/form-data; boundary=XyZboundary"


def _png(size=(64, 48)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, "white").save(buffer, format="PNG")
    return buffer.getvalue()


def _xlsx(table: list[list[str]]) -> bytes:
    """Minimal real .xlsx (inline strings) whose first sheet needs the workbook rels to be located."""
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    sheet = "".join(
        f'<row r="{n}">' + "".join(f'<c r="{chr(65 + i)}{n}" t="inlineStr"><is><t>{cell}</t></is></c>' for i, cell in enumerate(row)) + "</row>"
        for n, row in enumerate(table, 1)
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("xl/workbook.xml", f'<workbook xmlns="{ns}" xmlns:r="{RNS}"><sheets><sheet name="账单" r:id="rId9"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId9" Target="worksheets/data.xml"/></Relationships>')
        archive.writestr("xl/worksheets/data.xml", f'<worksheet xmlns="{ns}">{sheet}</worksheet>')
    return buffer.getvalue()


def _multipart(boundary: str, payload: bytes) -> bytes:
    head = f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="shot.png"\r\nContent-Type: image/png\r\n\r\n'
    return head.encode() + payload + f"\r\n--{boundary}--\r\n".encode()


async def _upload(body: bytes, content_type: str, limit: int):
    chunks = [body]

    async def receive():
        return {"type": "http.request", "body": chunks.pop() if chunks else b"", "more_body": False}

    scope = {"type": "http", "method": "POST", "path": "/", "query_string": b"", "headers": [(b"content-type", content_type.encode())]}
    return await routes.read_upload(Request(scope, receive), limit, "截图")


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="ledger-test-"))
        for module in (ledger, workbench_modules):
            patcher = mock.patch.object(module, "VAULT_DIR", self.root)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.addCleanup(shutil.rmtree, self.root, True)

    @staticmethod
    def _entry(amount: float, day: str = "2026-11-20", **extra) -> dict:
        return {"occurred_date": day, "amount": amount, "merchant": "瑞幸", "category": "饮品零食", "payment_method": "微信", **extra}

    def _status(self, action, status: int) -> HTTPException:
        with self.assertRaises(HTTPException) as ctx:
            action()
        self.assertEqual(ctx.exception.status_code, status)
        return ctx.exception

    def test_plugin_registration_and_physical_isolation(self):
        for user in ("bear", "her"):
            plugin = next(m for m in workbench_modules.list_workbench_modules(user)["modules"] if m["id"] == "ledger")
            self.assertEqual((plugin["name"], plugin["icon"], plugin["enabled"]), ("随手记账", "wallet", True))
        bear = ledger.create_entries("bear", [self._entry(16.9)])["inserted"][0]
        her = ledger.get_ledger_overview("her")
        bear_db, her_db = ledger._db_path("bear"), ledger._db_path("her")
        self.assertTrue(bear_db.is_file() and her_db.is_file() and bear_db != her_db)
        self.assertEqual((her["summary"]["count"], her["entries"], her["available_months"]), (0, [], []))
        self._status(lambda: ledger.update_entry("her", bear["id"], {"amount": 1}), 404)
        self._status(lambda: ledger.delete_entry("her", bear["id"]), 404)
        self.assertEqual([e["id"] for e in ledger.get_ledger_overview("bear")["entries"]], [bear["id"]])

    def test_quick_text_multi_item(self):
        today, yesterday = date.today().isoformat(), (date.today() - timedelta(days=1)).isoformat()
        first, second = imp.parse_quick_text("早饭 12，昨天瑞幸 16.9 微信")
        self.assertEqual([(x["occurred_date"], x["amount"], x["category"]) for x in (first, second)],
                         [(today, 12.0, "餐饮"), (yesterday, 16.9, "饮品零食")])
        self.assertEqual((second["merchant"], second["payment_method"], second["source"]), ("瑞幸", "微信", "quick"))
        ride, lunch, hotpot = imp.parse_quick_text("昨天打车回家 38 微信；午饭25.5元\nAA火锅 95")
        self.assertEqual([(x["category"], x["merchant"], x["amount"]) for x in (ride, lunch, hotpot)],
                         [("交通", "打车回家", 38.0), ("餐饮", "午饭", 25.5), ("人情", "AA火锅", 95.0)])
        self.assertEqual(imp.parse_quick_text("谢谢，今天心情很好"), [])  # no amount -> no entries

    def test_strip_pii(self):
        self.assertEqual(imp.strip_pii("订单号 4200002345678901234567 收款方 瑞幸咖啡（上海）有限公司"), "订单号 收款方 瑞幸咖啡（上海）有限公司")
        self.assertEqual(imp.strip_pii("联系 13812345678 招商银行(尾号1234)"), "联系 招商银行")
        self.assertEqual(imp.strip_pii("招商银行储蓄卡(6222)"), "招商银行储蓄卡")
        self.assertEqual(imp.strip_pii("收货地址：上海市浦东新区张江路500号12室"), "")
        saved = ledger.create_entries("her", [{"amount": 9.9, "note": "单号 4200001234567890123456", "merchant": "电话13812345678"}])["inserted"][0]
        self.assertEqual((saved["merchant"], saved["note"]), ("电话", "单号"))

    def test_bill_import_dedup_and_filtering(self):
        wechat = imp.parse_bill_file("微信支付账单.csv", WECHAT_CSV.encode("utf-8-sig"))
        self.assertEqual((wechat["provider"], wechat["skipped"]), ("wechat", {**SKIPS, "refund": 1, "transfer": 1, "income": 1}))
        self.assertEqual([(x["amount"], x["category"], x["payment_method"]) for x in wechat["items"]], [(16.9, "饮品零食", "微信"), (96.4, "日用", "微信")])
        alipay = imp.parse_bill_file("alipay_record.csv", ALIPAY_CSV.encode("gb18030"))
        self.assertEqual((alipay["provider"], alipay["skipped"]), ("alipay", {**SKIPS, "refund": 1, "neutral": 1}))
        self.assertEqual([(x["amount"], x["category"], x["source"]) for x in alipay["items"]],
                         [(258.0, "餐饮", "alipay_import"), (79.9, "日用", "alipay_import")])  # the item (洗衣液) outranks the channel (京东)
        xlsx = imp.parse_bill_file("微信支付账单.xlsx", _xlsx([row.split(",") for row in WECHAT_CSV.splitlines()[1:]]))
        self.assertEqual([x["fingerprint"] for x in xlsx["items"]], [x["fingerprint"] for x in wechat["items"]])
        tabbed = imp.parse_bill_file("alipay.csv", ALIPAY_TABBED.encode("utf-8"))["items"]
        self.assertEqual([(x["amount"], x["category"], x["merchant"]) for x in tabbed], [(38.0, "交通", "滴滴出行")])
        items = wechat["items"] + alipay["items"] + xlsx["items"]
        self.assertNotIn("1001", json.dumps(items))  # raw order IDs are never kept, only their hash
        self.assertEqual(len(ledger.create_entries("bear", items)["inserted"]), 4)  # xlsx rows deduped against the CSV import
        self.assertEqual(ledger.create_entries("bear", items)["skipped"], 6)  # re-import never duplicates
        self.assertEqual(ledger.get_ledger_overview("bear", "2026-11")["summary"]["month_total"], 451.2)
        self.assertEqual(ledger.existing_fingerprints("bear", [x["fingerprint"] for x in items]), {x["fingerprint"] for x in items})

    def test_export_csv_and_wipe(self):
        ledger.create_entries("bear", [self._entry(16.9, day=f"2026-11-0{d}") for d in (1, 2, 3)])
        ledger.create_entries("bear", [self._entry(38, day="2026-10-30", merchant='=HYPERLINK("x")')])
        ledger.update_settings("bear", monthly_budget=1000)
        overview = ledger.get_ledger_overview("bear", "2026-11")
        self.assertEqual((overview["summary"]["month_total"], overview["summary"]["budget_remaining"]), (50.7, 949.3))
        self.assertEqual((overview["hidden_leaks"][0]["label"], overview["hidden_leaks"][0]["count"]), ("饮品零食", 3))
        raw = ledger.export_ledger_csv("bear", "2026-11")
        rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"))
        self.assertEqual((rows[0][:3], len(rows)), (["日期", "月份", "金额"], 4))
        exported = list(csv.reader(io.StringIO(ledger.export_ledger_csv("bear").decode("utf-8-sig"))))[1:]
        self.assertEqual([r[2] for r in exported], ["38.00", "16.90", "16.90", "16.90"])
        self.assertTrue(exported[0][4].startswith("'="))  # spreadsheet formula injection is neutralised
        self.assertEqual(ledger.wipe_all_ledger_data("bear"), {"ok": True, "removed": 4})
        empty = ledger.get_ledger_overview("bear", "2026-11")
        self.assertEqual((empty["summary"]["count"], empty["settings"]), (0, {"monthly_budget": 0.0, "strict_offline": True}))

    def test_ocr_guards_and_receipt_parsing(self):
        with mock.patch.object(ocr, "_engine_available", return_value=False):
            self.assertEqual(self._status(lambda: asyncio.run(ocr.parse_receipt_image(_png())), 503).detail, ocr.ENGINE_MISSING)
        huge = io.BytesIO()
        Image.new("L", (6000, 5000)).save(huge, format="PNG")  # 30M pixels > 25M limit
        wide = io.BytesIO()
        Image.new("RGB", (3000, 200), "white").save(wide, format="PNG")
        for payload, status in ((b"\xff\xd8\xff" + b"0" * ocr.MAX_OCR_BYTES, 413), (huge.getvalue(), 413),
                                (b"GIF89a" + b"0" * 40, 400), (b"\xff\xd8\xff truncated", 400)):
            self._status(lambda payload=payload: ocr.prepare_image(payload), status)
        self.assertEqual(max(Image.open(io.BytesIO(ocr.prepare_image(wide.getvalue()))).size), ocr.MAX_SIDE)
        child = ("import io, json, sys; from PIL import Image; Image.open(io.BytesIO(sys.stdin.buffer.read()))"
                 "; print(json.dumps([{'text': t} for t in ['付款成功', '-25.00', '收款方', '海底捞', '付款时间', '2026-11-26 19:02:11', '付款方式', '花呗']]))")
        with mock.patch.object(ocr, "_engine_available", return_value=True), mock.patch.object(ocr, "OCR_CHILD_SCRIPT", child):
            result = asyncio.run(ocr.parse_receipt_image(_png()))
        self.assertEqual([(x["amount"], x["merchant"], x["payment_method"]) for x in result["items"]], [(25.0, "海底捞", "支付宝")])
        listed = ocr.parse_receipt_lines(["本月支出 ¥1234.50", "瑞幸咖啡", "11-27 12:30", "-¥16.90", "滴滴出行", "11-26 08:01", "-¥38.00", "订单号 4200001234567890123456"])
        self.assertEqual([(x["amount"], x["merchant"], x["category"]) for x in listed["items"]], [(16.9, "瑞幸咖啡", "饮品零食"), (38.0, "滴滴出行", "交通")])
        self.assertNotIn("4200001234", listed["raw_preview_sanitized"])

    def test_upload_reader_stays_in_memory(self):
        body = _multipart("XyZboundary", _png() + b"\r\n--decoy\r\nbinary\xff\x00")
        found = asyncio.run(_upload(body, CONTENT_TYPE, 10 << 20))
        self.assertEqual(found[0], "shot.png")
        self.assertTrue(found[1].startswith(b"\x89PNG") and found[1].endswith(b"binary\xff\x00"))
        self._status(lambda: asyncio.run(_upload(_multipart("XyZboundary", bytes(200_000)), CONTENT_TYPE, 64 << 10)), 413)
        self._status(lambda: asyncio.run(_upload(body, "application/json", 64)), 400)

    def test_summary_cli(self):
        tool = TOOLS / "ledger_summary.py"
        run = lambda *args, cwd=None, script=tool: subprocess.run(  # noqa: E731
            [sys.executable, str(script), *args], capture_output=True, text=True, encoding="utf-8", cwd=cwd, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        self.assertEqual((run("--help").returncode, "--month" in run("--help").stdout), (0, True))
        ledger.create_entries("bear", [self._entry(16.9), self._entry(38, day="2026-11-21", merchant="滴滴出行", category="交通")])
        summary = json.loads(run("--month", "2026-11", "--vault-dir", str(self.root / "bear")).stdout)
        self.assertEqual((summary["ok"], summary["month"], summary["total"], summary["count"]), (True, "2026-11", 54.9, 2))
        missing = json.loads(run("--vault-dir", str(self.root / "nobody")).stdout)
        self.assertEqual((missing["ok"], missing["error"]), (False, "账本尚未创建（还没有任何记账数据）"))
        skill, cwd = self.root / "skill", self.root / "cwd"  # the skill's own ./vault wins over the cwd one
        (skill / "tools").mkdir(parents=True)
        (cwd / "vault").mkdir(parents=True)
        shutil.copy(tool, skill / "tools" / tool.name)
        for vault_dir, amount in ((skill / "vault", 11.0), (cwd / "vault", 22.0)):
            with mock.patch.object(ledger, "VAULT_DIR", vault_dir.parent):
                ledger.create_entries("vault", [self._entry(amount)])
        db_file = skill / "vault" / "workbench" / "ledger.db"
        before = db_file.read_bytes()
        self.assertEqual(json.loads(run(cwd=cwd, script=skill / "tools" / tool.name).stdout)["total"], 11.0)
        self.assertEqual(db_file.read_bytes(), before)  # read-only
