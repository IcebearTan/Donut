"""Ledger deterministic parsers: PII masker, category classifier, quick text, WeChat/Alipay bills.
Zero external AI calls (0 tokens): everything below is pure stdlib and fully offline.
"""
from __future__ import annotations

import hashlib
import re
from datetime import date, timedelta
from typing import Any, Optional

from .workbench_ledger_bill import decode_bill_rows, excel_date, optional_cell

CATEGORIES = ("餐饮", "饮品零食", "交通", "购物", "日用", "娱乐", "学习", "医疗", "居住", "人情", "其他")
PAYMENT_METHODS = ("微信", "支付宝", "银行卡", "现金", "其他")

_PII_RE = re.compile(r"\d{12,}|(?<!\d)1[3-9]\d{9}(?!\d)|[（(]?\s*尾\s*号\s*\(?\d{4}\s*[)）]?|[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_CARD_TAIL_RE = re.compile(r"[（(]\s*\d{4}\s*[)）]")
_ADDRESS_RE = re.compile(r"[^\s，,；;。]{0,15}(?:路|街|巷|弄|大道)\d+号[^\s，,；;。]*|\d+号\d*(?:室|楼|栋|单元|座)[^\s，,；;。]*")
_ADDRESS_LABEL_RE = re.compile(r"(?:收货|配送|收件|详细)?地址[:：]")
_WS_RE = re.compile(r"\s+")


def _tidy(text: Any) -> str:
    # A LEADING dash is meaningful (OCR `-25.00` = money out), so only trailing dashes are trimmed.
    return _WS_RE.sub(" ", str(text or "")).strip(" \t:：,，;；.。·|").rstrip("-—")


def strip_pii(text: Any) -> str:
    """Mask order/transaction IDs, phone numbers, card tails, e-mails and address fragments."""
    out: list[str] = []
    for line in str(text or "").splitlines():
        line = _ADDRESS_LABEL_RE.split(line)[0]
        line = _tidy(_CARD_TAIL_RE.sub(" ", _PII_RE.sub(" ", _ADDRESS_RE.sub(" ", line))))
        if line:
            out.append(line)
    return "\n".join(out)


# Keyword dictionary as "category:alternation"; first matching rule wins (AA火锅 -> 人情, not 餐饮).
_CATEGORY_RULES = tuple(
    (line.split(":", 1)[0], re.compile(line.split(":", 1)[1]))
    for line in (
        "饮品零食:瑞幸|星巴克|喜茶|霸王茶姬|奈雪|蜜雪冰城|茶百道|古茗|茶颜悦色|沪上阿姨|库迪|一点点|CoCo"
        "|奶茶|咖啡|拿铁|美式|果茶|茶饮|甜品|蛋糕|面包|烘焙|零食|冰淇淋|可乐|雪碧|饮料",
        "交通:滴滴|打车|出租车|的士|网约车|地铁|公交|高铁|火车|12306|机票|航空|机场|加油|油费|中石化"
        "|中石油|壳牌|停车|高德|单车|骑行|ETC|轮渡|客运|大巴",
        "医疗:医院|药房|药店|诊所|体检|牙科|口腔|挂号|医药|疫苗|卫生院|眼科",
        "居住:房租|租金|水电|物业|宽带|燃气|电费|水费|供暖|房贷|取暖|话费|通信|中国移动|中国联通|中国电信",
        "娱乐:电影|影院|游戏|Steam|KTV|景点|门票|旅游|酒店|民宿|网吧|剧本杀|演出|视频|音乐|乐园|游乐",
        "学习:书店|图书|书籍|教材|买书|课程|网课|培训|考试|报名费|学费|打印|复印|GPT|API|ChatGPT"
        "|OpenAI|Claude|Notion|得到|知乎|学堂|网盘|会员",
        "人情:红包|礼物|礼品|(?i:aa)|请客|份子|随礼|生日|鲜花|花店|礼金",
        "日用:超市|便利店|屈臣氏|日用品|洗发水|纸巾|卫生纸|牙膏|沐浴露|洗衣液|母婴|名创优品|全家"
        "|罗森|山姆|盒马|菜市场|买菜|果蔬",
        "购物:淘宝|京东|拼多多|天猫|衣服|美妆|护肤|鞋子|服装|得物|唯品会|苏宁|宜家|无印|优衣库"
        "|化妆品|口红|面膜|数码|电器|家具|抖音|1688|快递|顺丰|驿站",
        "餐饮:餐厅|饭店|小吃|面馆|火锅|烧烤|外卖|美团|饿了么|午饭|早饭|晚饭|早餐|午餐|晚餐|夜宵"
        "|饭|餐|食堂|厨房|粥|粉|厨|食|堡|烤|炸|拉面|米线|麦当劳|肯德基|必胜客|海底捞|茶餐厅",
    )
)


def classify_expense(text: Any) -> str:
    """Deterministic keyword classifier; defaults to 其他."""
    for name, pattern in _CATEGORY_RULES:
        if pattern.search(str(text or "")):
            return name
    return "其他"


def build_item(
    occurred_date: str, amount: float, text: str, payment_method: str = "", source: str = "quick",
    note: str = "", fingerprint: str = "",
) -> dict[str, Any]:
    """Build one sanitized preview/entry dict (PII stripped, classified)."""
    merchant_text = strip_pii(text).replace("\n", " ").strip("-—")
    note_text = _tidy(strip_pii(note).replace("\n", " "))[:120]
    return {
        "occurred_date": occurred_date, "month": occurred_date[:7], "amount": round(float(amount), 2),
        "category": classify_expense(f"{merchant_text} {note_text}"), "merchant": _tidy(merchant_text)[:40],
        "payment_method": payment_method if payment_method in PAYMENT_METHODS else "",
        "note": note_text, "source": source, "fingerprint": fingerprint,
    }


# --- Quick natural-language multi-item parser -------------------------------
_SPLIT_RE = re.compile(r"[，,；;\n]+|以及|还有|外加")
_DATE_RE = re.compile(r"(?P<y>\d{4})[-/年.](?P<m>\d{1,2})[-/月.](?P<d>\d{1,2})日?|(?P<m2>\d{1,2})[-/月](?P<d2>\d{1,2})日?")
_PAY_WORDS = (("微信", "微信"), ("支付宝", "支付宝"), ("花呗", "支付宝"), ("刷卡", "银行卡"), ("银行卡", "银行卡"), ("现金", "现金"))
_COUNT_RE = re.compile(r"\d+(?:\.\d+)?\s*(?:杯|个|份|人|次|张|瓶|包|斤|件|位|盒|袋|套|双|只)")
_AMT_RE = re.compile(r"\d+(?:\.\d{1,2})?")
_YUAN_RE = re.compile(r"(\d+(?:\.\d{1,2})?)\s*(?:元|块)")
_REL_DAYS = (("前天", 2), ("昨天", 1), ("今天", 0))


def resolve_date(year: int, month: int, day: int) -> Optional[str]:
    """ISO date for an explicit year, or a month/day (last year if that day is still in the future)."""
    today = date.today()
    for candidate_year in ((year,) if year else (today.year, today.year - 1)):
        try:
            candidate = date(candidate_year, month, day)
        except ValueError:
            return None
        if year or candidate <= today:
            return candidate.isoformat()
    return None


def parse_quick_text(text: Any) -> list[dict[str, Any]]:
    """Parse `早饭 12，昨天瑞幸 16.9 微信` style input into sanitized entry dicts."""
    items: list[dict[str, Any]] = []
    for segment in _SPLIT_RE.split(str(text or "")):
        if not segment.strip():
            continue
        day = date.today()
        for word, offset in _REL_DAYS:
            if word in segment:
                day -= timedelta(days=offset)
                break
        matched = _DATE_RE.search(segment)
        if matched:
            groups = matched.groupdict()
            resolved = resolve_date(
                int(groups["y"] or 0), int(groups["m"] or groups["m2"]), int(groups["d"] or groups["d2"])
            )
            if not resolved:
                continue
            day = date.fromisoformat(resolved)
        label, pay = _DATE_RE.sub(" ", segment), ""
        for word, method in _PAY_WORDS:
            pay = method if word in segment else pay
            label = label.replace(word, " ")
        for word, _ in _REL_DAYS:
            label = label.replace(word, " ")
        label = _COUNT_RE.sub(" ", label)
        numbers = _YUAN_RE.findall(label) or _AMT_RE.findall(label)
        if numbers:
            label = re.sub(r"[元块¥￥]", " ", _AMT_RE.sub(" ", label))
            items.append(build_item(day.isoformat(), float(numbers[-1]), _tidy(label), pay, "quick"))
    return items


# --- WeChat / Alipay official bill import -----------------------------------
_DAY_RE = re.compile(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})")
_INTERNAL_RE = re.compile(r"零钱通|余额宝|提现|不计收支|转入|转出|还款|理财|基金|余额|充值")
_SERVICE_CHARGE_RE = re.compile(r"话费|流量|点卡")  # `话费充值` is real spending, not an internal transfer


def make_fingerprint(day: str, amount: float, merchant: str, order_hint: str = "") -> str:
    """Deterministic dedup key; the raw order ID is hashed and never stored."""
    hint = hashlib.sha1((order_hint or "").encode("utf-8")).hexdigest()[:12]
    return hashlib.sha1(f"{day}|{amount:.2f}|{merchant}|{hint}".encode("utf-8")).hexdigest()[:16]


def _norm(cell: str) -> str:
    return re.sub(r"\s+", "", cell).replace("（", "(").replace("）", ")")


def _col(header: list[str], *names: str) -> Optional[int]:
    """Column index by exact header name first, then by prefix (金额(元) / 金额（元） variants)."""
    for name in names:
        if name in header:
            return header.index(name)
    return next((i for i, cell in enumerate(header) for name in names if cell.startswith(name)), None)


def _parse_amount(raw: str) -> Optional[float]:
    try:
        return float(re.sub(r"[¥￥,，\s元]", "", raw))
    except ValueError:
        return None


def _parse_bill_rows(rows: list[list[str]], ext: str) -> dict[str, Any]:
    header_idx = next((i for i, row in enumerate(rows[:60])
                       if "收/支" in (cells := [_norm(c) for c in row]) and {"交易时间", "交易创建时间"} & set(cells)), -1)
    if header_idx < 0:
        raise ValueError("未识别到账单表头，请上传微信支付 / 支付宝官方导出的 CSV 或 XLSX 账单")
    header = [_norm(c) for c in rows[header_idx]]
    prelude = "".join(" ".join(r) for r in rows[:header_idx + 1])
    is_wechat = "微信" in prelude or "交易单号" in header
    if not is_wechat and "支付宝" not in prelude and not any(h.startswith("商品") for h in header):
        raise ValueError("未识别到微信支付 / 支付宝账单格式")
    provider = "wechat" if is_wechat else "alipay"
    i_time = _col(header, "交易时间", "交易创建时间")
    i_party, i_dir, i_amount = _col(header, "交易对方"), _col(header, "收/支"), _col(header, "金额(元)", "金额")
    i_product = _col(header, "商品", "商品名称", "商品说明")
    i_status = _col(header, "当前状态", "交易状态")
    i_order, i_type = _col(header, "交易单号", "交易订单号", "交易号"), _col(header, "交易类型")
    if None in (i_time, i_party, i_dir, i_amount):
        raise ValueError("账单缺少关键列（交易时间 / 交易对方 / 收/支 / 金额）")
    payment = "微信" if provider == "wechat" else "支付宝"
    skipped = {"refund": 0, "transfer": 0, "income": 0, "neutral": 0, "invalid": 0}
    items: list[dict[str, Any]] = []
    for row in rows[header_idx + 1:]:
        if len(row) <= max(i_time, i_party, i_dir, i_amount):
            continue
        when, direction = excel_date(row[i_time].strip()), row[i_dir].strip()
        if direction != "支出":
            skipped["income" if direction == "收入" else "neutral"] += 1
            continue
        matched, amount = _DAY_RE.match(when), _parse_amount(row[i_amount].strip())
        if not matched or amount is None or amount <= 0:
            skipped["invalid"] += 1
            continue
        party, product, status, order_id = (optional_cell(row, i) for i in (i_party, i_product, i_status, i_order))
        if "退款" in status or "退款" in product:
            skipped["refund"] += 1
            continue
        internal = _INTERNAL_RE.search(f"{optional_cell(row, i_type)} {status} {party} {product}")
        if internal and not (internal.group(0) == "充值" and _SERVICE_CHARGE_RE.search(product)):
            skipped["transfer"] += 1
            continue
        day = "{:04d}-{:02d}-{:02d}".format(*(int(g) for g in matched.groups()))
        merchant = _tidy(strip_pii(party).replace("\n", " "))[:40] or "未知商户"
        items.append(build_item(day, amount, merchant, payment, f"{provider}_import", product,
                                make_fingerprint(day, amount, merchant, order_id or when)))
    return {
        "provider": provider, "format": ext, "count": len(items),
        "total": round(sum(x["amount"] for x in items), 2), "items": items, "skipped": skipped,
    }


def parse_bill_file(filename: str, raw_bytes: bytes) -> dict[str, Any]:
    """Parse an official WeChat Pay / Alipay bill (CSV or XLSX) into PII-free, dedupable items."""
    ext, rows = decode_bill_rows(filename, raw_bytes)
    return _parse_bill_rows(rows, ext)
