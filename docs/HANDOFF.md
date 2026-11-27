# Donut 维护记录与跨模型交接手册 (`HANDOFF.md`)

> 最后更新：2026-11-27（线上基线 commit：`4464ae8`，PWA `sw.js`：`donut-portal-shell-v24`）
> 本文件供后续任何接入的 Agent Harness / 模型快速掌握项目现状、已完成里程碑、云端拓扑与待办事项。工程规范见根目录 [AGENTS.md](../AGENTS.md)。

---

## 1. 当前线上状态与云端拓扑

- **云主机**：`root@43.139.111.113`（2 vCPU / 4 GB RAM，OpenClaw Gateway 常驻约 ~1.9 GB RAM；已配置 swap）。
- **访问入口**：
  - 备案过渡期（当前）：`http://43.139.111.113:8443/`
  - 正式域名（等待公网 ICP 备案，预计 12 月中旬通过）：`https://icebear-yearning.fun`
- **反向代理**：Caddy 监听 `:8443` 与 `icebear-yearning.fun`，将 Portal 转发至 `127.0.0.1:8081`，I-land 转发至 `127.0.0.1:8000`。
- **服务与目录**：
  - 程序目录：`/opt/couple-space/portal`（Python venv：`/opt/couple-space/portal-venv`，已安装 `rapidocr-onnxruntime 1.4.4` 与系统包 `libgl1`）
  - systemd 服务：`couple-portal.service`（`127.0.0.1:8081`，健康检查 `GET /portal-api/health` → `{"ok":true}`）
  - 数据根目录：`PORTAL_DATA_DIR=/var/lib/couple-space/portal`（`publish_cloud.ps1` **绝不覆盖此目录**）
  - OpenClaw 双工作区：
    - `bear`：`/home/donut/.openclaw/workspace`（`vault` 软链指向 `/var/lib/couple-space/portal/vault/bear`）
    - `her`：`/home/donut/.openclaw/workspace-her`（`vault` 软链指向 `/var/lib/couple-space/portal/vault/her`）
  - 技能与 CLI 工具自动同步：`publish_cloud.ps1` 自动将 `openclaw-skills/workbench-builder` 同步至上述两个工作区（含 `focus_sync.py`、`workbench_app.py`、`ledger_summary.py`）。

---

## 2. 已完成里程碑记录

| 日期 | Commit | 主题 | 核心改动摘要 |
|---|---|---|---|
| 2026-11-26 | `0784405` | 双核工作台基础架构 | 重构工作台为双核基座（`今日焦点` + `定时任务`）+ 按用户隔离的扩展注册表；`报销台账` 迁为可选插件；移除旧 Notion Token 强耦合；新增 `focus_sync.py`。 |
| 2026-11-26 | `c001bc9` | 自进化微应用双引擎 | 新增 per-user 微应用引擎（Engine A：`checklist`/`table`/`cards`/`markdown` 声明式模板；Engine B：无 `allow-same-origin` 沙箱 HTML iframe + `window.DonutApp` 桥接）；新增 `workbench-builder` 技能与 `workbench_app.py`。 |
| 2026-11-26 | `904a9dd` | 今日焦点精简 | 移除今日焦点手动创建 UI，改为纯 AI/OpenClaw 同步 + 勾选完成；进度摘要支持 2 行显示。 |
| 2026-11-27 | `7855254` | 备案前后端安全加固 | `token_version` + `exp` 会话吊销、`POST /portal-api/auth/logout-all`、登录/改密滑窗限流（`429`）、纯 ASGI CSRF Origin/Referer 校验中间件与防御响应头、密码最短长度提升至 8 位；11 项安全单测通过。 |
| 2026-11-27 | `e4b5c28` | 随手记账后端与离线 OCR | 注册官方内置插件 `ledger`（默认对 `bear`/`her` 开启）；每用户独立 SQLite（`vault/<uid>/workbench/ledger.db`）；0 Token 中文多笔速记解析；纯内存短生命周期 `RapidOCR` 子进程 + PII 脱敏；微信 CSV/XLSX 与支付宝 CSV 导入去重；`ledger_summary.py`；19 项单测通过。 |
| 2026-11-27 | `8896660` | 随手记账官方前端 UI | 17 个模块化组件（反焦虑 KPI、预算进度、分类分布、小额高频提醒、隐私信任说明、隐藏金额、CSV 导出/清空）；前端 422 数组报错格式化与 8 位密码校验对齐。 |
| 2026-11-27 | `d1a1c76` | URL Hash 路由持久化 + 全局 0 Token 速记 | 新增 `portalRoute.ts` 修复工作台/文件仓/设置页刷新跳回主对话；聊天输入框回形针旁新增轻量钱包图标 + 全局 `Alt+L` 呼出 `QuickLedgerModal`（支持一句话速记、`Ctrl+V` 贴图离线 OCR、手动精记）。 |
| 2026-11-27 | `d4c2309` | 记账动效体系 + 4×3 跨年月份选择器 | 新增 `useAnimatedNumber.ts`（全指标平滑滚动 + 手动刷新柔和回弹）、`LedgerMonthPopover.tsx`（跨年 + 有账目圆点 + 一键回本月）；顶栏右侧主 CTA `+ 记一笔`；速记框支持 `Ctrl+V` 贴图 OCR；月份切换左右轻滑、柱条伸展、列表错峰入场。 |
| 2026-11-27 | `4464ae8` | 清爽双态工作台 | 重构为 `WorkbenchHub`（Bento 双卡：今日焦点可直接勾选 + 随手记账本月速览 + 工具磁贴网格）+ 进入模块后的单行极简 `WorkbenchBreadcrumb`（支持下拉秒切模块）；`sw.js` 升至 `v24`。 |

---

## 3. 本地开发环境说明（Windows + WSL2）

- **Windows 宿主机**：安装有 `node` (v22)、`pnpm`、`git`、`claude` CLI（本机未装原生 Windows Python）。
- **WSL2 (`OpenClaw` 发行版)**：
  - Python 3.12 虚拟环境：`/home/openclaw/portal-venv/bin/python3`（含 `fastapi`、`pydantic`、`starlette`、`pillow` 等）。
  - 前端构建缓存目录：`~/portal-fe-build`（含 `node_modules`，由 `scripts/build_portal_bundle.sh` 同步源码并执行 `tsc -b && vite build`）。
- **协作约定**：本仓库历史开发采用「架构/设计规范 → 分阶段实现 + 编译验证 → 本地干净 `git commit` → 手动人工网页验收」节奏，任务规范归档在 `docs/tasks/`。

---

## 4. 待办与后续演进清单

### P0 — 12 月中旬 ICP 备案通过后立即执行（详见 [安全与 OCR 蓝图](plans/2026-11-26-security-hardening-and-ocr.md)）
- [ ] 全员切换至 `https://icebear-yearning.fun` 访问。
- [ ] 开启 `PORTAL_COOKIE_SECURE=1`（Cookie 强制 `Secure`）。
- [ ] 将 systemd 中的敏感环境变量迁移至 `/etc/couple-space/portal.env`（`chmod 640`/`600`）。
- [ ] 在 Caddy 中启用 HSTS 与完整安全响应头，并关闭公网 `:8443` 过渡端口。
- [ ] 收紧 `/var/lib/couple-space/portal` 文件系统权限（`0700`/`0600`），配置 SSH 密钥加固、`ufw`、`fail2ban` 与加密每日定时备份。

### P1 — 可选产品体验增强（按需排期）
- [ ] 在「个人主页与设置 → 账号与安全」中暴露 `POST /portal-api/auth/logout-all`（「退出其他所有设备」）按钮。
- [ ] 随手记账汇总卡片中按需展示 `top_expenses`（本月大额支出 TOP 榜）。
- [ ] 探索更多由 OpenClaw 生成的个人微应用，或为随手记账增加周期性固定支出模板（房租/订阅）。
