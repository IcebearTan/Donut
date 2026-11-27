# Donut

双人专属极简 AI 陪伴空间与自进化个人工作台（支持 `bear` / `her` 严格数据隔离，统一入口无缝衔接主对话、个人工作台、私有文件仓与独立扩展应用）。

> 给接入本仓库的 AI Agent / 开发工具：请先阅读 [AGENTS.md](AGENTS.md) 与 [docs/HANDOFF.md](docs/HANDOFF.md)。

## 核心模块

- **主对话 & 项目记忆**：Dot 风格零焦虑流式对话、双人独立助手人设（`SOUL.md` / `USER.md`）、项目级上下文隔离与一键沉淀。
- **双态个人工作台（`#workbench`）**：
  - **Hub 总览**：Bento 双卡（今日焦点可直接勾选 + 随手记账本月速览）+ 整齐的工具与扩展磁贴网格。
  - **沉浸式模块**：单行极简面包屑与快速模块切换栏；内置核心模块 `今日焦点`、`定时任务`，以及按用户独立开关的官方插件（`随手记账`、`报销台账`）与 OpenClaw 自进化微应用双引擎（声明式模板 + 沙箱 HTML）。
- **随手记账（官方插件）**：每用户独立 SQLite 账本、**0 Token 中文多笔离线速记**（支持全局 `Alt + L` 与聊天输入框一键呼出）、**纯内存离线截图 OCR**（`RapidOCR`，支持 `Ctrl+V` 贴图，原图不落盘且不发外部 AI）、微信/支付宝账单导入与去重、隐藏金额开关与一键导出/清空。
- **文件仓 & 安全基线**：私有文件管理、Token 版本号吊销与全端登出、登录/改密滑窗限流、CSRF 来源校验与安全响应头。

## 技术栈

- **后端**：FastAPI + Uvicorn + SQLite（Python 3.12），独立子进程 `rapidocr-onnxruntime` 离线 OCR。
- **前端**：React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + `lucide-react`，全站浅色/深色 CSS 变量与 PWA Service Worker。

## 本地验证与发版

```powershell
# 1. 后端语法与单元测试（WSL2 venv）
wsl -d OpenClaw -- /home/openclaw/portal-venv/bin/python3 -m py_compile /mnt/d/OpenClaw/portal/backend/app/*.py
wsl -d OpenClaw -- /home/openclaw/portal-venv/bin/python3 -m unittest discover -s /mnt/d/OpenClaw/portal/backend/tests -v

# 2. 前端类型检查与打包（WSL2）
wsl -d OpenClaw -- bash /mnt/d/OpenClaw/portal/scripts/build_portal_bundle.sh

# 3. 增量发布到云端（绝不覆盖云端数据库、上传文件与 OpenClaw 记忆）
powershell -ExecutionPolicy Bypass -File D:\OpenClaw\portal\scripts\publish_cloud.ps1
```

## 文档导航

- [AGENTS.md](AGENTS.md) — 跨 Harness / 跨模型开发规范（权威约束）
- [CLAUDE.md](CLAUDE.md) — Claude Code 入口（与 `AGENTS.md` 同步）
- [docs/HANDOFF.md](docs/HANDOFF.md) — 维护记录、架构全景、云端拓扑与待办清单
- [docs/plans/2026-11-26-security-hardening-and-ocr.md](docs/plans/2026-11-26-security-hardening-and-ocr.md) — 2C4G 离线 OCR 与 ICP 备案前后安全加固蓝图
