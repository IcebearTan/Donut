# Donut Portal · 2核4G 本地离线 OCR 与后端安全加固方案

> 本文档基于当前线上实际代码与部署现状（`43.139.111.113` / 2C4G / Caddy + FastAPI `uvicorn 127.0.0.1:8081` + OpenClaw Gateway `127.0.0.1:18789`）整理，可直接移交给负责安全加固的模型或工程师按优先级分步执行。

---

## 第一部分：2核4G 服务器运行本地离线 OCR 的可行性与资源预算

### 1. 结论：完全可行，但必须「轻量化 ONNX + 按需子进程释放」

当前线上 OpenClaw Node 进程常驻内存约 `1.88 GB`（在 4 GB 机器上约占 49%），因此**严禁**安装完整 PaddlePaddle 框架或在 `uvicorn` 主进程中常驻加载大模型。必须采用以下资源受控方案：

| 维度 | 推荐方案：`rapidocr-onnxruntime`（PP-OCRv4 mobile） | 避坑项 |
| :--- | :--- | :--- |
| 模型体积 | ~15 MB（`det + rec + cls` 移动端量化 ONNX） | 完整 PaddlePaddle 依赖 >1.2 GB |
| 推理峰值内存 | **~180–260 MB**（单图、长边缩至 `1280px`、`OMP_NUM_THREADS=1`） | 多并发同时推理易触发 OOM |
| 静默期常驻内存 | **0 MB**（按需拉起独立短生命周期子进程，或空闲 60s 自动退出） | 常驻在 `uvicorn` 进程中长期吃掉 ~250 MB |
| 单张截图耗时（2 vCPU） | **0.6 – 1.5 秒**（标准微信/支付宝支付截图） | 原图 4K 不缩放直接推理（>5s） |
| 隐私保障 | 原图仅在内存/`/dev/shm` 流转，**0 字节外发第三方 API**，解析完立即销毁 | 落盘到 `vault/inbox/` 或上传云端视觉 API |

### 2. 2C4G 防 OOM 工程约束（强制执行）
1. **全局单并发锁**：后端使用 `asyncio.Semaphore(1)` 串行化 OCR 任务，排队队列上限 5，超出直接返回 `429`。
2. **前置图片瘦身与安全解码**：使用 Pillow 校验 Magic Bytes，设置 `Image.MAX_IMAGE_PIXELS = 25_000_000` 防像素炸弹，转换为 RGB 并等比缩放至长边 `<= 1280px` 后再送入 OCR。
3. **子进程硬上限**：OCR worker 设置环境变量 `OMP_NUM_THREADS=1`、`ORT_NUM_THREADS=1`，子进程超时 `15s` 强杀，并通过 `resource.setrlimit` 限制虚拟内存上限；确认服务器已配置 `2 GB` Swap 作为极端突发缓冲。
4. **更极致的零负载补充路线（手机原生端侧 OCR）**：
   - iOS 可配一个 3 步「快捷指令」：截屏/选图 → 调用系统本地 `提取图像中的文本`（Apple Vision 离线完成） → 仅 POST 脱敏文本到 Donut 记账接口，**服务器 0 MB 内存消耗、原图甚至不离开手机**。

---

## 第二部分：后端与服务器全栈安全加固清单（GLM 落地蓝图）

基于已核查的真实代码（[auth.py](file:///d:/OpenClaw/portal/backend/app/auth.py)、[config.py](file:///d:/OpenClaw/portal/backend/app/config.py)、[main.py](file:///d:/OpenClaw/portal/backend/app/main.py)）与云端运行配置（`couple-portal.service`、`Caddyfile`），按风险从高到低分为 **P0 / P1 / P2** 三个阶段。

### P0（上线记账/敏感数据前必须修复）

#### 1. 收敛明文 HTTP 暴露面 + 强制 `Secure` Cookie（⚠️ 需等公网 ICP 备案通过后启用）
- **现状问题**：
  - 当前域名公网 ICP 备案尚未下发，因此临时通过 `http://43.139.111.113:8443` 访问；`couple-portal.service` 未设置 `PORTAL_COOKIE_SECURE=1`（[config.py](file:///d:/OpenClaw/portal/backend/app/config.py#L22) 默认为 `False`）。
- **分阶段执行边界（避免锁死登录）**：
  - **备案前**：**切勿**开启 `PORTAL_COOKIE_SECURE=1` 或关闭 `:8443`（浏览器在明文 HTTP 下会拒绝保存 `Secure` Cookie，导致无法登录）；其余 P0/P1 项（Token 过期与 `token_version` 吊销、登录限流、环境变量迁至 `portal.env`、目录权限 `0700/0600`、SSH 与 `fail2ban`）均可随时先落地。
  - **备案通过且 `https://icebear-yearning.fun` 证书生效后**：立即开启 `PORTAL_COOKIE_SECURE=1`、补充 Caddy HSTS 响应头，并在云安全组/Caddy 中关停公网 `http://:8443`（或仅限 Tailscale/内网访问）。

#### 2. 修复会话令牌无过期校验与无法作废（Revocation）
- **现状问题**：
  - [auth.py](file:///d:/OpenClaw/portal/backend/app/auth.py#L68-L86) 中 `create_session_token` 仅签了 `uid` 和 `iat`，但 `verify_session_token` **未校验过期时间**，且缺少服务端版本戳——旧 Cookie 在改密码或退出登录后依然长期有效。
- **加固措施**：
  1. `users` 表新增 `token_version INTEGER NOT NULL DEFAULT 1`（幂等迁移）。
  2. Token payload 写入 `{"uid": user_id, "ver": token_version, "exp": now_ms() + COOKIE_MAX_AGE * 1000}`；`verify_session_token` 强制校验 `exp > now_ms()`，`get_current_user` 强制比对 `token.ver == user.token_version`。
  3. 用户修改密码（`/portal-api/auth/password`）或点击「退出全部设备」时执行 `token_version = token_version + 1`，瞬间吊销全部历史会话。

#### 3. 登录与改密接口防暴力破解（Rate Limiting + 强密码策略）
- **现状问题**：
  - `/portal-api/auth/login` 与 `/portal-api/auth/password` 均无限流，且 `/portal-api/auth/users` 未登录即返回全部账号名。
- **加固措施**：
  1. 在后端添加轻量滑动窗口限流（按客户端真实 IP + 目标用户名维度）：5 分钟内连续失败 5 次锁定 15 分钟，返回 `429`。
  2. 记录登录失败审计日志（脱敏，绝不记录密码原文）。
  3. `PasswordChangeRequest` 将最低密码长度从 4 提升至 `>= 8`（并建议两人将初始密码 `123456` 更换为高强度独立口令）；可选通过配置项决定是否关闭未登录状态下的账号列表提示。

---

### P1（应用层纵深防御与隐私数据保护）

#### 4. 敏感配置脱离 systemd 单元文件 + 严格目录权限
- **现状问题**：
  - `/etc/systemd/system/couple-portal.service`（通常 `0644`）中明文存在 `PORTAL_SSO_SECRET` 与 `PORTAL_SEED_USERS`。
- **加固措施**：
  1. 将所有敏感环境变量迁移至 `/etc/couple-space/portal.env`，设置 `chown root:donut` 与 `chmod 640`（或 `donut:donut 600`），systemd 使用 `EnvironmentFile=/etc/couple-space/portal.env`。
  2. 账号已初始化完成后移除 `PORTAL_SEED_USERS` 中的默认弱密码。
  3. 核查并收敛数据目录权限：`/var/lib/couple-space/portal`、`portal.db`、`.secret`、`vault/bear`、`vault/her` 均为 `0700 / 0600`（仅 `donut` 用户可读写）。

#### 5. 反向代理安全响应头与 CSRF 双重校验
- **Caddy 安全头**（添加到 `couple_routes`）：
  - `Strict-Transport-Security "max-age=31536000; includeSubDomains"`
  - `X-Content-Type-Options "nosniff"`
  - `X-Frame-Options "SAMEORIGIN"`
  - `Referrer-Policy "no-referrer"`
  - `Permissions-Policy "geolocation=(), microphone=(), camera=()"`
- **后端 Origin / Referer 校验中间件**：
  - 对所有写方法（`POST` / `PUT` / `PATCH` / `DELETE`），校验请求头 `Origin`（或回退 `Referer`）必须匹配配置的受信任源（如 `https://icebear-yearning.fun`），配合 `SameSite=Lax` 彻底封堵 CSRF。

#### 6. 记账与文件上传通道专项安全规范
- **文件类型与大小硬限制**：支付截图上传限制 `<= 10 MB`，校验文件头 Magic Bytes（仅白名单 `PNG / JPEG / WebP`），拒绝 `SVG`、脚本与畸形图片。
- **内存处理与零残留**：OCR 截图仅使用内存缓冲区或 `tmpfs`，`try/finally` 立即释放，绝不写入 `vault/inbox/` 或磁盘日志。
- **PII 自动脱敏**：无论是 OCR 文本还是微信/支付宝 CSV/XLSX 导入，解析阶段强制正则丢弃 12 位以上订单号/交易流水号、银行卡尾号、手机号、姓名与收货地址。
- **日志脱敏铁律**：FastAPI 异常日志与 `journald` 严禁打印账单明细、请求体原文、Cookie 或 Authorization 头。
- **跨用户隔离审计**：所有 `/portal-api/workbench/*` 路由统一通过 `Depends(get_current_user)` 派生路径，禁止前端传入 `user_id`；保留路径穿越与软链接拒绝校验（与现有 [workbench_apps.py](file:///d:/OpenClaw/portal/backend/app/workbench_apps.py) 一致）。

---

### P2（主机层、网络边界与可恢复性）

#### 7. 主机防火墙与最小端口暴露
- 核对 `ss -tlnp` 与云安全组 / `ufw`：
  - 公网仅放行 `80/tcp`、`443/tcp` 和必要 SSH 端口；
  - 确认 `8081`（Portal）、`8000`（I-land）、`18789`（OpenClaw Gateway）均严格绑定 `127.0.0.1`，禁止 `0.0.0.0` 暴露。

#### 8. SSH 与系统基线加固
- `/etc/ssh/sshd_config`：确认 `PasswordAuthentication no`、`PubkeyAuthentication yes`、`PermitRootLogin prohibit-password`（或改用普通 sudo 用户登录），并启用 `fail2ban` 防护 SSH 扫描。
- 开启系统安全补丁自动更新（`unattended-upgrades`）。

#### 9. 数据主权与加密备份
- 为 `/var/lib/couple-space/portal/portal.db`（使用 `sqlite3 .backup` 在线热备）与 `vault/` 建立每日定时加密备份（如 `age` / `gpg` 加密后归档，保留最近 7–14 天）。
- 前端记账插件向用户提供「一键导出全部账单」与「一键彻底清空账本」（以及可选浏览器端 `WebCrypto PBKDF2 + AES-GCM` 本地 PIN 加密模式）。

---

## 第三部分：移交 GLM 后的验收核对表

执行完上述加固后，可按以下 6 项直接验收：

1. **HTTPS & Cookie**：浏览器登录 `https://icebear-yearning.fun`，DevTools 中 `portal_session` 具备 `HttpOnly; Secure; SameSite=Lax`，且公网 `http://43.139.111.113:8443` 不可明文访问。
2. **Token 吊销**：修改密码后，用修改前保存的旧 Cookie 请求 `/portal-api/auth/me` 必须返回 `401`。
3. **防爆破**：连续 5 次错误密码调用 `/portal-api/auth/login`，第 6 次必须返回 `429`。
4. **CSRF 防护**：伪造 `Origin: https://evil.example` 发起 `POST /portal-api/workbench/focus/items` 必须返回 `403`。
5. **权限与文件隔离**：`stat -c '%a %U:%G' /etc/couple-space/portal.env /var/lib/couple-space/portal/portal.db` 均不包含全局可读权限（无 `o+r`）；`bear` 的 Cookie 请求 `her` 的任意资源必须返回 `404`。
6. **2C4G OCR 压测**：连续提交 3 张 3MB 微信支付截图，验证 `free -m` 峰值增量 `< 300 MB`、推理完毕 60s 内回落至基线、磁盘无原图残留。
