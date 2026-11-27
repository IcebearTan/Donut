"""Memory-only offline screenshot OCR for 随手记账 (strictly local, nothing ever leaves the server).

Privacy / resource guards for the 2C4G host:
- <= 10MB upload, magic bytes PNG/JPEG/WebP only, <= 25M pixels, downscaled to <= 1280px in memory.
- The original screenshot is NEVER written to disk; only the downscaled PNG bytes are piped to a
  short-lived isolated subprocess (rapidocr_onnxruntime, 1 thread, 15s timeout) via stdin.
- A single global asyncio.Semaphore(1) serializes OCR so one request cannot starve the 2 vCPUs.
"""
from __future__ import annotations

import asyncio
import importlib.util
import io
import json
import os
import re
import sys
from datetime import date
from typing import Any

from fastapi import HTTPException
from PIL import Image, ImageOps

from .workbench_ledger_import import build_item, resolve_date, strip_pii

MAX_OCR_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 25_000_000
MAX_SIDE = 1280
OCR_TIMEOUT_SECONDS = 15
ENGINE_MISSING = "服务器离线 OCR 引擎尚未安装，请先使用文字速记或微信/支付宝账单导入"
ENGINE_FAILED = "OCR 引擎识别失败，请稍后重试或改用文字速记"
ENGINE_TIMEOUT = "OCR 识别超时，请压缩截图后重试或使用文字速记"
OCR_CHILD_SCRIPT = r"""
import io, json, sys
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR
result, _ = RapidOCR()(np.asarray(Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB")))
print(json.dumps([{"text": box[1], "score": round(float(box[2]), 3)} for box in (result or [])], ensure_ascii=False))
"""
_ocr_semaphore = asyncio.Semaphore(1)


def _engine_available() -> bool:
    try:
        return importlib.util.find_spec("rapidocr_onnxruntime") is not None
    except (ImportError, ValueError):
        return False


def prepare_image(raw: bytes) -> bytes:
    """Validate + downscale in memory -> PNG bytes. Raises clean 4xx HTTP errors, never persists."""
    if len(raw) > MAX_OCR_BYTES:
        raise HTTPException(413, "截图不能超过 10MB")
    is_webp = raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"
    if not (raw.startswith(b"\x89PNG\r\n\x1a\n") or raw.startswith(b"\xff\xd8\xff") or is_webp):
        raise HTTPException(400, "仅支持 PNG / JPG / WebP 格式的截图")
    previous = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        try:
            img = Image.open(io.BytesIO(raw))
            if img.width * img.height > MAX_PIXELS:
                raise HTTPException(413, "截图分辨率过高（上限 2500 万像素），请压缩后重试")
            img.load()
            img = ImageOps.exif_transpose(img) if img.format == "JPEG" else img
            out = io.BytesIO()
            rgb = img.convert("RGB") if img.mode != "RGB" else img.copy()
            rgb.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
            rgb.save(out, format="PNG", optimize=True)
            return out.getvalue()
        except HTTPException:
            raise
        except Exception as exc:  # corrupt / truncated / decompression bomb
            raise HTTPException(400, "图片无法解码，请重新截图后上传") from exc
    finally:
        Image.MAX_IMAGE_PIXELS = previous


async def _run_ocr(png_bytes: bytes) -> list[dict[str, Any]]:
    env = {**os.environ, "OMP_NUM_THREADS": "1", "ORT_NUM_THREADS": "1"}
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-I", "-c", OCR_CHILD_SCRIPT,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=env,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(png_bytes), OCR_TIMEOUT_SECONDS)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        raise HTTPException(504, ENGINE_TIMEOUT)
    if proc.returncode != 0:
        raise HTTPException(503, ENGINE_FAILED)
    try:
        lines = [ln for ln in stdout.decode("utf-8", "replace").splitlines() if ln.strip()]
        return json.loads(lines[-1])
    except (IndexError, ValueError) as exc:
        raise HTTPException(503, ENGINE_FAILED) from exc


async def parse_receipt_image(raw: bytes) -> dict[str, Any]:
    """Entry point: bytes on the wire -> sanitized preview items (async, serialized, memory-only)."""
    if not _engine_available():
        raise HTTPException(503, ENGINE_MISSING)
    png_bytes = await asyncio.to_thread(prepare_image, raw)
    async with _ocr_semaphore:
        boxes = await _run_ocr(png_bytes)
    return parse_receipt_lines([box.get("text", "") for box in boxes])


_LABEL_RE = re.compile(r"^(?:收款方|商户全称|商户|收款人|商家|付款给|收款账户|对方)\s*[:：]?\s*(.*)$")
_METHOD_RE = re.compile(r"^(?:付款方式|支付方式)\s*[:：]?\s*(.*)$")
_PAYTO_RE = re.compile(r"向(.{1,30}?)(?:支付|付款|转账)")
_AMOUNT_RE = re.compile(r"[-−–—]?\s*[¥￥]\s*(\d+(?:\.\d{1,2})?)")
_BARE_AMOUNT_RE = re.compile(r"(?<![\d.])[-−–—]\s?(\d+\.\d{2})(?![\d.])")
_DATE_RE = re.compile(r"(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})|(?<![\d-])(\d{1,2})[-/月](\d{1,2})日?(?![\d.])")
_SKIP_AMOUNT_RE = re.compile(r"合计|总计|总额|本月|本周|本年|退款|收入|余额|优惠|立减|折扣|免单|\*{2,}")
_NOISE_RE = re.compile(
    r"支付|付款|收款|订单|账单|金额|交易|退款|成功|方式|时间|备注|商品|详情|更多|完成|返回|客服|单号|状态|说明|优惠|立减|折扣|积分|[¥￥]|^[\d\s:：./年月日-]+$"
)


def _around(index: int, size: int, span: int) -> list[int]:
    """Neighbour indices ordered by distance (previous, next, previous-2, next+2, ...)."""
    order: list[int] = []
    for distance in range(1, span + 1):
        order += [j for j in (index - distance, index + distance) if 0 <= j < size]
    return order


def _labeled(lines: list[str], index: int, pattern: re.Pattern) -> str:
    for j in _around(index, len(lines), 6):
        match = pattern.match(lines[j])
        if match:
            if match.group(1).strip():
                return match.group(1).strip()
            if j + 1 < len(lines) and not _NOISE_RE.search(lines[j + 1]):
                return lines[j + 1]
    return ""


def _payment_method(text: str) -> str:
    for words, method in ((r"零钱|微信", "微信"), (r"花呗|余额宝|支付宝", "支付宝"), (r"银行卡|储蓄卡|信用卡", "银行卡")):
        if re.search(words, text):
            return method
    return ""


def parse_receipt_lines(raw_lines: list[str]) -> dict[str, Any]:
    """Deterministic WeChat / Alipay receipt heuristics over sanitized OCR lines (0 tokens)."""
    lines = [re.sub(r"\s+", " ", part).strip() for line in raw_lines for part in strip_pii(line).split("\n")]
    lines = [line for line in lines if line]
    hits: list[tuple[int, float, str]] = []
    for index, line in enumerate(lines):
        if _SKIP_AMOUNT_RE.search(line):
            continue
        hits += [(index, float(m.group(1)), line) for m in _AMOUNT_RE.finditer(line)]
        if any(word in part for part in lines[max(index - 1, 0):index + 2] for word in ("支付", "付款", "交易", "金额", "扣款")):
            hits += [(index, float(m.group(1)), line) for m in _BARE_AMOUNT_RE.finditer(line)]
    items, seen = [], set()
    for index, amount, line in hits:
        payto = _PAYTO_RE.search(line)
        merchant = payto.group(1) if payto else _labeled(lines, index, _LABEL_RE)
        if not merchant:
            # List cards read top-down as [merchant, time, amount]: look backwards first, then forwards.
            nearby = lines[max(0, index - 5):index][::-1] + lines[index + 1:index + 6]
            merchant = next((candidate for candidate in nearby if not _NOISE_RE.search(candidate)), "")
        day = date.today().isoformat()
        for j in _around(index, len(lines), 8):
            found = _DATE_RE.search(lines[j])
            if found:
                resolved = resolve_date(
                    int(found.group(1) or 0), int(found.group(2) or found.group(4)), int(found.group(3) or found.group(5))
                )
                if resolved:
                    day = resolved
                break
        method = _payment_method(_labeled(lines, index, _METHOD_RE))
        if not method:
            joined = " ".join(lines[max(0, index - 8):index + 9])
            method = "微信" if "微信" in joined else ("支付宝" if "支付宝" in joined else "")
        key = (day, amount, merchant)
        if key not in seen and amount > 0:
            seen.add(key)
            items.append(build_item(day, amount, merchant, method, "ocr", "截图识别"))
    return {"items": items, "raw_preview_sanitized": " | ".join(lines)[:600]}
