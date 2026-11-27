# Task Spec: Pre-ICP Backend Security Hardening + Official Curated Plugin 「随手记账（Ledger）」

Follow `D:\OpenClaw\portal\CLAUDE.md` strictly:
- Every newly created file MUST stay **<= 280 lines** (split cleanly by responsibility).
- **Zero Emoji** in all new UI components; use `lucide-react` icons only.
- Support both Light & Dark themes via `themes.css` CSS variables.
- Strictly preserve per-user isolation (`bear` vs `her`) and do NOT pollute `chat_sessions` / `chat_messages`.
- **Pre-ICP constraint**: Keep `COOKIE_SECURE` default `0` (`PORTAL_COOKIE_SECURE=1` opt-in via env) and allow same-host + `:8443` origins in CSRF checks so `http://43.139.111.113:8443/` continues working cleanly.

---

## Stage 1: Pre-ICP Backend Security Hardening

### 1.1 Session Token Expiration & Server-Side Revocation (`db.py`, `auth.py`, `main.py`)
- **`backend/app/db.py`**:
  - Add idempotent migration on `users`: `token_version INTEGER NOT NULL DEFAULT 1`.
- **`backend/app/auth.py`**:
  - Update `create_session_token(user_id: str, token_version: int = 1)` to embed `{"uid": user_id, "ver": token_version, "exp": now_ms() + COOKIE_MAX_AGE * 1000, "iat": now_ms()}`.
  - Update `verify_session_token(token: Optional[str]) -> Optional[tuple[str, int]]`:
    - Verify HMAC signature with `hmac.compare_digest`.
    - Enforce `exp` check: if `"exp"` exists and `now_ms() > int(exp)`, return `None`. (For legacy tokens without `exp`, check `iat + COOKIE_MAX_AGE * 1000 >= now_ms()`).
    - Return `(uid, int(data.get("ver", 1)))`.
  - Update `set_auth_cookie(response, user_id, token_version=1)` and `get_current_user`:
    - Query `SELECT id, display_name, avatar_emoji, assistant_name, assistant_emoji, token_version FROM users WHERE id = ?`.
    - Verify `int(row["token_version"]) == token_ver`; otherwise raise `401`.
    - Do NOT expose `token_version` in public user profile dict if unnecessary (strip it before returning `user`).
- **`backend/app/main.py`**:
  - Pass `row["token_version"]` on login when calling `set_auth_cookie`.
  - In `PasswordChangeRequest`: keep `current_password` min_length=1, set `new_password` min_length=8.
  - On `POST /portal-api/auth/password`: increment `token_version = token_version + 1` in `users` AND refresh the current user's cookie with the new `token_version` so current session stays logged in while all other old cookies are revoked immediately.
  - Add `POST /portal-api/auth/logout-all`: increments `token_version = token_version + 1` and clears cookie.

### 1.2 Login & Password Rate Limiter (`backend/app/rate_limit.py` + `main.py`)
- Create `backend/app/rate_limit.py` (~90 lines):
  - Thread-safe in-memory sliding-window limiter (`SlidingWindowLimiter`):
    - Tracks failures by key (`ip:<ip>` and `acct:<name>`): 5 failures within 300s -> lock for 900s (HTTP `429` with friendly Chinese message `"尝试次数过多，请稍后再试"`).
    - `check_allowed(key)`, `record_failure(key)`, `reset(key)`, `extract_client_ip(request)`.
  - Wire into `/portal-api/auth/login` (reset on successful login; record failure on 401; never log plaintext password!) and `/portal-api/auth/password`.

### 1.3 CSRF Origin / Referer Middleware (`backend/app/security_middleware.py` + `main.py`)
- Create `backend/app/security_middleware.py` (~85 lines):
  - For mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) on `/portal-api/*`:
    - If `Origin` header is present, verify its `scheme://netloc` matches either:
      1) the request's own `Host` header (`http://<host>` or `https://<host>`), OR
      2) `PORTAL_ALLOWED_ORIGINS` env comma-separated allowlist (default includes `https://icebear-yearning.fun`, `http://43.139.111.113:8443`, `http://localhost:5173`, `http://127.0.0.1:8081`).
    - If `Origin` is absent but `Referer` is present, validate `Referer`'s origin against the same rule.
    - Reject cross-origin mutations with HTTP `403` JSON `{"detail": "Forbidden origin"}`.
  - Add defensive response headers on all responses: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- Register middleware in `backend/app/main.py`.

---

## Stage 2: Official Built-in Curated Plugin · 「随手记账（Ledger）」

### 2.1 Plugin Registration (`backend/app/workbench_modules.py`)
- Add built-in plugin `ledger` to `BUILTIN_PLUGINS`:
  - `id`: `"ledger"`
  - `kind`: `"builtin"`
  - `name`: `"随手记账"`
  - `description`: `"零外发离线记账、微信/支付宝账单导入与月度消费洞察"`
  - `icon`: `"wallet"`
  - `default_users`: `{"bear", "her"}` (strictly isolated per user; either user can toggle off in `管理扩展`)
  - `removable`: `False`

### 2.2 Isolated Storage & Core Ledger Service (`backend/app/workbench_ledger.py`, <= 270 lines)
- Physical isolation: per-user SQLite database at `VAULT_DIR / user_id / "workbench" / "ledger.db"` with `os.chmod(path, 0o600)` (best effort on non-POSIX).
- Schema:
  - `ledger_entries`:
    - `id TEXT PRIMARY KEY`
    - `occurred_date TEXT NOT NULL` (`YYYY-MM-DD`)
    - `month TEXT NOT NULL` (`YYYY-MM`)
    - `amount REAL NOT NULL` (positive float, 2 decimals)
    - `category TEXT NOT NULL` (e.g. `餐饮`, `饮品零食`, `交通`, `购物`, `日用`, `娱乐`, `学习`, `医疗`, `居住`, `人情`, `其他`)
    - `merchant TEXT NOT NULL DEFAULT ''` (sanitized short merchant/title)
    - `payment_method TEXT NOT NULL DEFAULT ''` (`微信`, `支付宝`, `银行卡`, `现金`, `其他`, or empty)
    - `note TEXT NOT NULL DEFAULT ''`
    - `source TEXT NOT NULL DEFAULT 'manual'` (`quick` | `ocr` | `wechat_import` | `alipay_import` | `manual`)
    - `fingerprint TEXT NOT NULL DEFAULT ''` (for deduplication on bill imports, indexed)
    - `created_at INTEGER NOT NULL`
    - `updated_at INTEGER NOT NULL`
  - `ledger_settings`:
    - `key TEXT PRIMARY KEY`, `value TEXT NOT NULL`
    - Keys: `monthly_budget` (float, default `0` = unset), `strict_offline` (`"1"` default ON — strictly forbids any external AI calls!).
- Functions:
  - `get_ledger_overview(user_id, month: Optional[str])`:
    - Returns `{ month, available_months, settings: { monthly_budget, strict_offline }, summary: { month_total, count, daily_avg, budget, budget_remaining, budget_pct, daily_allowance }, categories: [{ name, total, count, pct }], hidden_leaks: [{ label, count, total }], top_expenses: [...], entries: [...] }`.
    - `hidden_leaks`: detects frequent small expenses (e.g. `饮品零食`, `交通` / 打车, or any category with `count >= 3` and `avg <= 60`) to gently highlight "拿铁因子".
  - `create_entries(user_id, items)` (supports batch insert + optional dedup check)
  - `update_entry(user_id, entry_id, patch)`
  - `delete_entry(user_id, entry_id)`
  - `update_settings(user_id, monthly_budget=None, strict_offline=None)`
  - `export_ledger_csv(user_id, month=None) -> bytes` (UTF-8 with BOM for Excel friendliness)
  - `wipe_all_ledger_data(user_id)` (deletes all entries & resets settings cleanly)

### 2.3 Deterministic Quick Parser + PII Masker + Bill Importer (`backend/app/workbench_ledger_import.py`, <= 270 lines)
- **PII Masking (`strip_pii(text: str) -> str`)**:
  - Removes 12+ digit transaction/order IDs, phone numbers (11 digits starting with 1), bank card tail patterns (`尾号\d{4}`, `\(\d{4}\)`), and address-like lines.
- **Category Classifier (`classify_expense(text: str) -> str`)**:
  - Rich deterministic Chinese keyword dictionary covering 餐饮, 饮品零食 (瑞幸/星巴克/喜茶/霸王茶姬/奶茶/咖啡/甜品), 交通 (滴滴/打车/地铁/公交/高德/高铁/油费), 购物 (淘宝/京东/拼多多/衣服/美妆/护肤/鞋子), 日用 (超市/便利店/屈臣氏/日用品/洗发水), 娱乐 (电影/游戏/KTV/景点), 学习 (书/课程/会员/打印/GPT/API), 医疗 (医院/药房/体检), 居住 (房租/水电/物业/宽带), 人情 (红包/礼物/聚餐/AA).
- **Quick Natural-Language Multi-Item Parser (`parse_quick_text(text: str) -> list[dict]`)**:
  - 0-Token deterministic parser! Splits by Chinese/English commas, semicolons, newlines (`[，,；;\n]+` or `以及/还有/外加`).
  - Handles relative dates (`今天`, `昨天`, `前天`, `MM-DD`, `M月D日`), payment methods (`微信`, `支付宝`, `刷卡`, `现金`), and amounts (e.g. `"瑞幸 16.9"`, `"昨天打车回家 38 微信"`, `"午饭25.5元"`, `"AA火锅 95"`).
- **WeChat / Alipay Official Bill Importer (`parse_bill_file(filename: str, raw_bytes: bytes) -> dict`)**:
  - Supports `.csv` (auto-detects `utf-8-sig`, `gb18030`, `gbk`) and `.xlsx` (via `openpyxl` if available, else clear error message; add `openpyxl` or pure zipfile XML fallback if needed — actually check `requirements.txt`, pure Python or `openpyxl` is fine, let's include pure-stdlib `.xlsx` sheet reader OR add `openpyxl` to `requirements.txt`? Even better: lightweight stdlib `zipfile + xml.etree.ElementTree` `.xlsx` reader takes ~35 lines and needs ZERO extra pip dependency!).
  - Auto-detects WeChat Pay bill format (`微信支付账单明细`, header containing `交易时间`, `交易对方`, `商品`, `收/支`, `金额(元)`) and Alipay bill format (`支付宝交易记录明细`, header containing `交易时间`/`交易创建时间`, `交易对方`, `商品说明`/`商品名称`, `收/支`, `金额`).
  - Only imports `支出` rows; skips refunds (`已全额退款`, `退款`), internal transfers (`零钱通`, `余额宝`, `提现`, `充值`, `不计收支`), and `amount <= 0`.
  - Strips all PII (drops order IDs, counterparty accounts, card numbers), computes deterministic `fingerprint = sha1(f"{date}|{amount:.2f}|{merchant}|{source_order_hint}")[:16]` (hashes order ID if present without ever storing the raw order ID!) so re-importing overlapping weeks NEVER creates duplicates!

### 2.4 Memory-Only Offline Screenshot OCR (`backend/app/workbench_ledger_ocr.py`, <= 220 lines)
- **Strict Resource & Privacy Guards (for 2C4G server)**:
  - Max upload size `<= 10 MB`; Magic Bytes check (`PNG`, `JPEG`, `WebP` only).
  - Decode in `BytesIO` with Pillow (`Image.MAX_IMAGE_PIXELS = 25_000_000`), convert to RGB, downscale so `max(w, h) <= 1280`, encode to temporary PNG bytes in memory. **Never save original screenshot to disk!**
  - Global `asyncio.Semaphore(1)` to serialize OCR on 2 vCPU.
  - Run `rapidocr_onnxruntime` inside an isolated short-lived subprocess (`sys.executable -c ...`, `OMP_NUM_THREADS=1`, `ORT_NUM_THREADS=1`, `timeout=15`) piping PNG bytes over `stdin` and reading JSON lines over `stdout`, so RAM returns to **0 MB** immediately when subprocess exits!
  - If `rapidocr_onnxruntime` is not installed yet, return a clean HTTP `503` with detail `"服务器离线 OCR 引擎尚未安装，请先使用文字速记或微信/支付宝账单导入"` (never crash!).
  - Parse OCR lines with `strip_pii` + WeChat/Alipay payment receipt heuristics (extracts `amount` from `-¥xx.xx`/`¥xx.xx`/`支付成功` nearby, `merchant`, `occurred_date`, `payment_method`, `category`) -> returns `{ items: [...], raw_preview_sanitized: "..." }` for frontend 1-click confirmation.

### 2.5 Ledger API Routes (`backend/app/workbench_ledger_routes.py`, <= 180 lines) + Mount
- Mount inside `backend/app/workbench_routes.py` under `/ledger`:
  - `GET /portal-api/workbench/ledger?month=YYYY-MM`
  - `POST /portal-api/workbench/ledger/entries` (create 1 or batch entries)
  - `PATCH /portal-api/workbench/ledger/entries/{entry_id}`
  - `DELETE /portal-api/workbench/ledger/entries/{entry_id}`
  - `PUT /portal-api/workbench/ledger/settings`
  - `POST /portal-api/workbench/ledger/quick-parse` (`{ text }` -> preview items)
  - `POST /portal-api/workbench/ledger/ocr-parse` (multipart `file` -> preview items, memory-only!)
  - `POST /portal-api/workbench/ledger/import-bill` (multipart `file`, optional `dry_run=1` -> imports or previews WeChat/Alipay CSV/XLSX with dedup!)
  - `GET /portal-api/workbench/ledger/export-csv?month=YYYY-MM`
  - `DELETE /portal-api/workbench/ledger/wipe` (`{ confirm: "WIPE" }` -> wipes all user ledger data)

### 2.6 OpenClaw Read-Only Summary Tool
- Create `openclaw-skills/workbench-builder/tools/ledger_summary.py` (~95 lines, `#!/home/donut/.openclaw/tools-venv/bin/python`, `--help` supported):
  - Reads ONLY the current user's `vault/workbench/ledger.db` (resolving via `Path(__file__).resolve().parent.parent / "vault"` first, just like `focus_sync.py`) and prints a compact JSON summary for `--month YYYY-MM` (or current month), so OpenClaw can answer spending questions in chat without flooding context.

### 2.7 Frontend Official Ledger Plugin (`frontend/src/components/workbench/ledger/`, each file <= 270 lines, 0 emojis)
- Update `frontend/src/api/client.ts`: add Ledger types & API methods.
- Create modular components under `frontend/src/components/workbench/ledger/`:
  1. `LedgerTab.tsx` (<= 250 lines): Shell holding month switcher, privacy mask state (`Eye`/`EyeOff`, saved in `localStorage`), top Privacy & Sovereign strip, `LedgerSummaryCards`, `LedgerQuickBar`, category/search filters, entries list with edit/delete, and modals.
  2. `LedgerSummaryCards.tsx` (<= 170 lines): Anti-anxiety KPIs (month total, budget progress bar + daily remaining allowance, category breakdown bars, hidden-leaks radar pills). All amounts respect `masked` (`¥****`).
  3. `LedgerQuickBar.tsx` (<= 210 lines): Zero-friction 1-line text quick entry (`瑞幸 16.9，打车 32`) + multi-screenshot offline OCR upload button (`Camera`/`ImagePlus`) + inline parsed-preview confirmation strip (showing only stripped `日期/金额/分类/商户` before 1-click confirm!) + button to open Bill Import modal.
  4. `LedgerEntryModal.tsx` (<= 170 lines): Add/Edit single ledger entry cleanly.
  5. `LedgerImportModal.tsx` (<= 180 lines): Drag-and-drop WeChat/Alipay CSV/XLSX bill importer with clear privacy guarantee notice (`100% 私有服务器离线解析 · 自动去重 · 自动剔除单号与卡号`) and import summary feedback.
  6. `LedgerPrivacyModal.tsx` (<= 190 lines): Monthly budget input, `"严格离线模式（禁止外发 AI）"` switch, honest data-flow trust card, `"导出 CSV"` button, and double-confirmed `"清空全部账本数据"` button.
- Wire `tab === 'ledger'` inside `frontend/src/components/WorkbenchView.tsx`.
- Bump `CACHE_NAME` in `frontend/public/sw.js` to `donut-portal-shell-v23`.

---

## Stage 3: Verification & Unit Tests (Must Pass Before Finishing!)
1. Create `backend/tests/test_security.py` covering:
   - Session token `exp` expiration rejection.
   - `token_version` revocation after password change / `logout-all`.
   - Login rate limiter locking after 5 failures -> HTTP `429`, reset after success.
   - CSRF middleware rejecting cross-origin `POST` (`403`) while allowing same-host & `:8443`.
2. Create `backend/tests/test_ledger.py` covering:
   - Strict `bear` vs `her` SQLite physical isolation.
   - Deterministic quick-text multi-item parsing (`"早饭 12，昨天瑞幸 16.9 微信"`).
   - PII stripping (order IDs, phone numbers, card tails removed).
   - WeChat CSV & Alipay CSV bill import with refund/transfer filtering AND duplicate prevention on re-import.
   - Export CSV & Wipe all data.
   - `ledger_summary.py --help` and real summary output.
3. Run:
   - `wsl -d OpenClaw -- python3 -m py_compile /mnt/d/OpenClaw/portal/backend/app/*.py /mnt/d/OpenClaw/portal/openclaw-skills/workbench-builder/tools/*.py`
   - `wsl -d OpenClaw -- python3 -m unittest discover -s /mnt/d/OpenClaw/portal/backend/tests -v`
   - `wsl -d OpenClaw -- bash /mnt/d/OpenClaw/portal/scripts/build_portal_bundle.sh` (and remove `/mnt/d/OpenClaw/portal-release.tar.gz`)
   - Verify **0 emojis** in `frontend/src/components/workbench/ledger/*.tsx` and every new file **<= 280 lines**.
4. Do NOT push or deploy to cloud yet — report a concise summary of changed files and test results so the orchestrator can review `git diff` and deploy!
