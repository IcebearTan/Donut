# Couple Space Portal (Donut · 我们的空间)

双人专属生活空间统一入口：默认进入极简 AI 陪伴界面（Donut），顶部一键无缝免登录切换 **I-land 像素小岛** 及未来独立扩展应用。

## 核心特性
- **统一入口 & 单点登录（SSO）**：一次登录全站通行，支持 `小熊`（`bear`）与 `yearning`（`her`）严格隐私隔离。
- **双人独立助手人设**：在「空间设置 → 我的助手人设」中各自自定义名字、头像、性格（`SOUL.md`）与主人档案（`USER.md`），互不干扰。
- **Dot 风格零焦虑交互**：5 分钟时间戳分割线、`发送中 → ✓ 已送达` 回执、动态「已思考 xx 秒」与工具状态提示、5 秒 SSE 心跳保活。
- **极简亮 / 暗双色主题**：全站 CSS 变量驱动（`frontend/src/styles/themes.css`），预留奶油风主题扩展位。

## 开发与发版流程
1. 在本机打开工作区 `D:\OpenClaw\portal` 进行开发与本地调试（本地访问 `http://localhost:8080/`）。
2. 提交 Git 记录。
3. 运行一键发布脚本将新版本增量推送到线上 `https://icebear-yearning.fun`（**绝不覆盖云端数据库、上传照片和 OpenClaw 长期记忆**）：
   ```powershell
   powershell -ExecutionPolicy Bypass -File D:\OpenClaw\portal\scripts\publish_cloud.ps1
   ```
   或直接双击 `D:\OpenClaw\Publish-Portal-Cloud.bat`。
