"""Bill file decoding for 随手记账: WeChat / Alipay CSV encodings and a stdlib XLSX sheet reader.

Pure stdlib (zipfile + xml.etree), zero extra pip dependency. Raises ValueError with a
user-facing Chinese message for anything unsupported; never writes to disk.
"""
from __future__ import annotations

import csv
import io
import re
import zipfile
from datetime import date, timedelta
from typing import Optional
from xml.etree import ElementTree as ET

MAX_BILL_BYTES = 20 * 1024 * 1024
MAX_UNZIPPED_BYTES = 200 * 1024 * 1024  # zip-bomb guard for .xlsx
_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_SERIAL_RE = re.compile(r"^\d{5}(?:\.\d+)?$")  # Excel serial date (days since 1899-12-30)


def decode_csv(raw: bytes) -> list[list[str]]:
    """utf-8-sig / gb18030 / gbk auto-detect. Alipay app exports are tab-separated rows."""
    text = None
    for encoding in ("utf-8-sig", "gb18030", "gbk"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("账单文件编码无法识别，请从微信 / 支付宝 App 重新导出")
    rows: list[list[str]] = []
    try:
        for row in csv.reader(io.StringIO(text)):
            if row and "\t" in row[0]:  # tab-separated fields, comma only before the trailing 备注 column
                row = [cell.strip() for cell in re.split(r"[\t,]", ",".join(row))]
            rows.append(row)
    except csv.Error as exc:
        raise ValueError(f"账单 CSV 解析失败：{exc}") from exc
    return rows


def _cell_index(cell: ET.Element) -> int:
    """Column index from the cell reference letters (`C5` -> 2); missing cells must not shift columns."""
    index = 0
    for char in (re.match(r"[A-Z]+", cell.get("r") or "") or ["A"])[0]:
        index = index * 26 + ord(char) - 64
    return index - 1


def _first_sheet(archive: zipfile.ZipFile) -> str:
    """Resolve the archive member of the first worksheet via workbook.xml relationships."""
    sheet = "xl/worksheets/sheet1.xml"
    if sheet in archive.namelist():
        return sheet
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rel_id = next(workbook.iter(_NS + "sheet")).get(_RNS + "id")
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target = next(r for r in rels if r.get("Id") == rel_id).get("Target").lstrip("/")
    return target if target.startswith("xl/") else "xl/" + target


def decode_xlsx(raw: bytes) -> list[list[str]]:
    """Read the first worksheet as string rows (shared / inline strings, numbers, serial dates)."""
    rows: list[list[str]] = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if sum(info.file_size for info in archive.infolist()) > MAX_UNZIPPED_BYTES:
            raise ValueError("账单文件解压后过大，请按月份分别导出")
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in si.iter(_NS + "t")) for si in root.iter(_NS + "si")]
        for row in ET.fromstring(archive.read(_first_sheet(archive))).iter(_NS + "row"):
            cells: dict[int, str] = {}
            for cell in row.iter(_NS + "c"):
                value, kind = cell.find(_NS + "v"), cell.get("t")
                if kind == "s":
                    text = shared[int(value.text)] if value is not None else ""
                elif kind == "inlineStr":
                    text = "".join(t.text or "" for t in cell.iter(_NS + "t"))
                else:
                    text = (value.text or "") if value is not None else ""
                cells[_cell_index(cell)] = text
            if cells:
                rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
    return rows


def decode_bill_rows(filename: str, raw_bytes: bytes) -> tuple[str, list[list[str]]]:
    """Validate the upload and return `(ext, rows)`; the caller owns WeChat/Alipay row semantics."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""
    if ext not in ("csv", "xlsx"):
        raise ValueError("仅支持微信 / 支付宝导出的 CSV 或 XLSX 账单文件")
    if not raw_bytes:
        raise ValueError("账单文件为空")
    if len(raw_bytes) > MAX_BILL_BYTES:
        raise ValueError("账单文件不能超过 20MB")
    return ext, decode_csv(raw_bytes) if ext == "csv" else decode_xlsx(raw_bytes)


def excel_date(value: str) -> str:
    """Convert an Excel serial date cell to ISO `YYYY-MM-DD`; other values pass through."""
    if _SERIAL_RE.match(value.strip()):
        return (date(1899, 12, 30) + timedelta(days=int(float(value)))).isoformat()
    return value


def optional_cell(row: list[str], index: Optional[int]) -> str:
    return row[index].strip() if index is not None and len(row) > index else ""
