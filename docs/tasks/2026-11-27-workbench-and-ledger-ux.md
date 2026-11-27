# 任务规范：随手记账体验升级 + 清爽双态工作台 + 路由持久化

> **角色说明**：本规范由总设计师（Antigravity）起草，供执行工程师（Claude Code / GLM 5.4）严格按阶段实现。
> **范围**：纯前端体验与架构升级，**不修改后端任何 Python 代码**（复用现有 `/portal-api/workbench/*` 全部接口）。

---

## 0. 全局设计准则（必须严格遵守）

1. **视觉与色彩语言**：严格使用 `frontend/src/styles/themes.css` 已有 CSS 变量（`--bg-page`、`--bg-surface`、`--bg-sidebar`、`--bg-elevated`、`--border-subtle`、`--border-strong`、`--text-primary`、`--text-secondary`、`--text-muted`、`--accent`、`--accent-contrast`、`--danger`、`--success`、`--shadow-sm`、`--shadow-card`、`--shadow-md`），兼容浅色与深色模式。**禁止硬编码彩色渐变或刺眼纯色**。
2. **零 Emoji 规范**：所有新增或修改的界面 chrome、按钮、Tab、卡片、弹窗、空状态一律使用 `lucide-react` 矢量图标，**0 Emoji**。
3. **模块化与文件体积**：每个新建或重写文件控制在 **100–250 行以内（绝不超过 260 行）**。对 `App.tsx` / `ChatView.tsx` 等大文件只做最小精准局部编辑，逻辑抽到独立文件。
4. **中文输入法安全**：所有回车提交必须复用 `isPlainEnter` / `guardImeEnter`，禁止在 IME 选词时误触发提交。
5. **动效克制且无障碍**：所有动画使用 `cubic-bezier(0.22, 1, 0.36, 1)`，时长 180–380ms，并在 `themes.css` 的 `@media (prefers-reduced-motion: reduce)` 中全部禁用。
6. **无回归**：构建使用 `MSYS_NO_PATHCONV=1 wsl -d OpenClaw -u openclaw -- bash /mnt/d/OpenClaw/portal/scripts/build_portal_bundle.sh` 校验 `tsc -b && vite build` 零错误。

---

## Stage A：URL Hash 路由持久化（修复刷新跳回主对话）+ 全局 0 Token 随手记入口

### A1. 新建 `frontend/src/utils/portalRoute.ts`（~110 行）
将页面导航状态双向同步到 `window.location.hash`，彻底解决在工作台 / 文件仓 / 设置页刷新浏览器时跳回主对话的 Bug，并支持浏览器前进/后退：

- **支持路由格式**：
  - `#chat`（或空 hash）→ `{ appId: 'donut' }`
  - `#workbench` → `{ appId: 'workbench', workbenchModule: null }`（工作台总览 Hub）
  - `#workbench/<moduleId>` → `{ appId: 'workbench', workbenchModule: '<moduleId>' }`（具体模块，如 `#workbench/ledger`、`#workbench/focus`、`#workbench/cron`、`#workbench/reimbursements`、微应用 ID）
  - `#vault` → `{ appId: 'vault' }`
  - `#settings` / `#settings/<section>` → `{ appId: 'settings', settingsSection }`（合法 section：`overview | assistant | skills | account`）
  - `#app/<id>` → `{ appId: '<id>' }`（外部应用，如 `island`）
- **导出 API**：
  - `export interface PortalRouteState { appId: string; workbenchModule: string | null; settingsSection: SettingsSection }`
  - `parsePortalHash(hash?: string): PortalRouteState`
  - `formatPortalHash(state: PortalRouteState): string`
  - `writePortalHash(state: PortalRouteState, replace?: boolean): void`（当 hash 变化时使用 `history.pushState` 或 `window.location.hash = ...`，相同时跳过；同时写入 `sessionStorage` 兜底）
  - `export const LEDGER_UPDATED_EVENT = 'donut:ledger-updated'`
  - `export function emitLedgerUpdated(): void`（通过 `window.dispatchEvent(new CustomEvent(LEDGER_UPDATED_EVENT))` 通知正在展示的账本/工作台 Hub 实时刷新）

### A2. 新建 `frontend/src/components/workbench/ledger/QuickLedgerModal.tsx`（~230 行）
让用户在**主对话首页或任意页面**无需切换工作台、**0 Token 离线**完成 2 秒随手记账：

- **定位与壳层**：复用 `LedgerModalFrame`（标题「随手记一笔」，副标题「离线解析 · 0 Token · 原图不落盘」），右上角（或标题栏 extra）提供轻量跳转按钮「打开完整账本 →」（点击调用 `onOpenLedgerPage()` 并关闭弹层）。
- **双模式分段切换器（Segmented Control，顶部紧凑居中）**：
  1. **`一句话速记`（默认选中）**：
     - 自动聚焦的文本输入框（`placeholder="午饭 25，瑞幸 16.9，昨天打车 38 微信"`），支持 **直接 `Ctrl+V` / 粘贴支付截图** 触发离线 OCR！
     - 底部操作行：左侧「粘贴或上传截图（离线 OCR）」按钮 + 右侧「解析」主按钮（`Enter` 直接解析）。
     - 解析/OCR 完成后立刻展示复用组件 `LedgerPreviewStrip`（支持逐笔移除），下方「确认记入 N 笔」主按钮（在已有 preview 且未修改文本时再按 Enter 也可直接确认入账）。
  2. **`手动精记`**：
     - 复用简洁紧凑的表单（大字号金额输入框 + 日期 + 分类芯片 + 商户 + 支付方式 + 备注），一键提交 `api.createLedgerEntries([{ ..., source: 'manual', fingerprint: '' }])`。
- **保存成功后**：
  - 调用 `emitLedgerUpdated()` 同步账本数据与工作台 Hub 卡片。
  - 调用 `onSaved(count, firstMonth)`（由父级弹 Toast，如 `已记入 2 笔`）并关闭弹层。
- **隐私 mask 同步**：读取 `localStorage.getItem('donut_ledger_masked_' + userId) === '1'`，预览金额遵守隐藏金额状态。

### A3. 精准编辑 `frontend/src/App.tsx` 与 `frontend/src/components/ChatView.tsx`
- **`App.tsx`**：
  1. 初始化 `activeAppId`、`workbenchModule`、`settingsSection` 均来自 `parsePortalHash(window.location.hash)`。
  2. 增加统一的导航函数 `navigateTo(next: Partial<PortalRouteState>)` 同步 state + `writePortalHash`。
  3. 监听 `window.addEventListener('hashchange', ...)` 同步浏览器前进/后退。
  4. `loadWorkspace()` 完成后，**不要覆盖**已从 hash 恢复的 `activeAppId`；若 `activeAppId` 是外部应用（`type === 'link'`），自动调用 `api.launchApp(activeAppId)` 恢复 `externalLaunchUrl`；若 `activeAppId` 无效（既非内置视图也不在 `meRes.apps`），回退到 `donut`。
  5. 查询 `ledgerEnabled` 状态：登录加载时轻量拉取 `api.listWorkbenchModules().then(r => setLedgerEnabled(r.modules.some(m => m.id === 'ledger' && m.enabled))).catch(() => {})`；并在 `WorkbenchView` 保存模块配置后通过回调同步更新 `ledgerEnabled`。
  6. 增加状态 `quickLedgerOpen` + 全局快捷键监听 `Alt + L`（`ledgerEnabled` 为 true 时切换 `quickLedgerOpen`），渲染 `<QuickLedgerModal>`。
  7. 将 `onOpenQuickLedger={ledgerEnabled ? () => setQuickLedgerOpen(true) : undefined}` 传给 `ChatView` 和 `WorkbenchView`。
  8. 移动端顶部标题栏：当 `activeAppId === 'workbench'` 且在子模块时依然清爽展示 `工作台`。
- **`ChatView.tsx`**：
  - `ChatView` & `ChatComposer` 接收可选 prop `onOpenQuickLedger?: () => void`。
  - 在 `ChatComposer` 左侧回形针按钮旁（同一排 `flex items-end gap-1.5`），若传入 `onOpenQuickLedger`，渲染一个同等尺寸（`w-9 h-9 rounded-full`）、克制低调的矢量按钮（`Wallet` 图标 `size={17}`，`data-testid="chat-quick-ledger-btn"`，`title="随手记一笔（0 Token 离线速记 · Alt+L）"`）。不加任何多余文字标签，保持聊天输入框极简胶囊感。

---

## Stage B：记账丝滑动效体系 + 年月气泡选择器 + 记账首屏视觉层级优化

### B1. 扩展 `frontend/src/styles/themes.css` 动效原语
新增克制、顺滑的通用微动效（全部纳入 `@media (prefers-reduced-motion: reduce)` 禁用列表）：
- `.animate-bar-grow`：`@keyframes bar-grow { from { transform: scaleX(0); opacity: 0.5; } to { transform: scaleX(1); opacity: 1; } }`，`transform-origin: left center; animation: bar-grow 380ms cubic-bezier(0.22, 1, 0.36, 1) both;`
- `.animate-slide-from-left`：`@keyframes slide-from-left { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }`（240ms）
- `.animate-slide-from-right`：`@keyframes slide-from-right { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }`（240ms）
- `.animate-stagger-in`：`@keyframes stagger-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`（240ms，支持行内 `animationDelay` 错峰）
- `.ledger-refreshing`：`opacity: 0.62; transition: opacity 160ms ease;`（刷新/切换请求期间柔和过渡，不闪屏）

### B2. 新建 `frontend/src/components/workbench/ledger/useAnimatedNumber.ts`（~65 行）
- `export function useAnimatedNumber(target: number, options?: { durationMs?: number; disabled?: boolean; replayKey?: number }): number`
- 使用 `requestAnimationFrame` + `easeOutCubic`（默认 `340ms`）从旧值平滑插值到 `target`。
- 当 `disabled === true`（如 `masked === true`）或系统 `prefers-reduced-motion: reduce` 时，直接返回 `target`，零延迟无动画。
- 当 `replayKey` 递增（例如用户手动点击「刷新」按钮即使总金额没变），从 `target * 0.86` 轻盈滚回 `target`（柔和数字回弹反馈，让刷新动作有清晰触感）。

### B3. 新建 `frontend/src/components/workbench/ledger/LedgerMonthPopover.tsx`（~160 行）
彻底取代原有功能重复的 `<select>`，提供大范围跨年跳转 + 账目分布可视化：
- **触发按钮**：居中显示 `2026 年 11 月` + `Calendar` / `ChevronDown` 小图标（`data-testid="ledger-month-trigger"`），点击切换悬浮气泡（`animate-pop-up`），点击外部或按 `Escape` 自动关闭。
- **气泡内部结构（宽 `w-[268px]`，`rounded-2xl`，`--bg-surface` + `--border-subtle` + `--shadow-md`）**：
  1. **年份切换头**：`‹`（`ChevronsLeft` 或 `ChevronLeft`）— `2026 年` — `›`，支持自由跨年跳转（最小到 `min(2020, earliestAvailableYear)`，最大到 `currentYear + 1`）。
  2. **4 × 3 十二个月网格**（`1月` ~ `12月`）：
     - 当前选中月：`--accent` 填充 + `--accent-contrast` 文字；
     - 当月（今天所在月）且未选中：淡淡 `1px solid var(--border-strong)` 描边区分；
     - **有账目记录的月份**（在 `availableMonths` 集合内）：数字下方显示一个 `w-1 h-1 rounded-full` 精致小圆点（选中态用 `--accent-contrast`，未选中用 `--accent`）；
     - 超过 `todayMonth() + 12` 个月的未来月份置灰禁用。
  3. **底部快捷栏**：左侧显示「已有 N 个月记录」，右侧「回到本月」按钮（点击跳回 `todayMonth()` 并关闭气泡）。

### B4. 重构 `LedgerHeader.tsx`、`LedgerSummaryCards.tsx`、`LedgerQuickBar.tsx`、`LedgerEntryList.tsx`、`LedgerTab.tsx`
1. **`LedgerHeader.tsx`**（<= 140 行）：
   - 左侧：`<` 上一月 + `<LedgerMonthPopover>` + `>` 下一月 + 当不在本月时显示轻量胶囊 `回本月` + 手动刷新图标按钮（`RefreshCw`，点击触发刷新并旋转）。
   - 右侧：
     - 严格离线微徽章（桌面端展示，移动端可精简）
     - 隐藏金额按钮（`Eye` / `EyeOff`）
     - 隐私与设置图标/胶囊按钮（`SlidersHorizontal`）
     - **最右侧醒目主 CTA 按钮：`+ 记一笔`**（`--accent` 背景、`--accent-contrast` 文字、`Plus` 图标，`data-testid="ledger-header-add"`），直接打开手动精记弹窗，彻底解决「人工记一笔入口藏太深」的问题！
2. **`LedgerSummaryCards.tsx`**（<= 200 行）：
   - 接收新增 props：`refreshTick: number`、`slideDir: 'left' | 'right' | 'none'`、`loading: boolean`。
   - **全部指标接入平滑动效**：
     - `month_total`（Hero 大数字）、`daily_avg`、`count`、`budget_pct`、`budget_remaining`、`daily_allowance` 全部使用 `useAnimatedNumber(..., { disabled: masked, replayKey: refreshTick })`！
     - `CategoryBars`：每个分类柱条使用 `key={`${data.month}-${refreshTick}-${cat.name}`}` + `.animate-bar-grow`（带 0ms / 35ms / 70ms 递进延迟），切换月份与刷新时流畅伸展！
     - `LeakPills`：每个高频胶囊带 `.animate-stagger-in` 递进淡入。
     - `BudgetCard` 进度条同样在切换月份与刷新时丝滑过渡（支持 `animate-bar-grow` 或 width transition）。
     - 整体容器在 `loading` 时轻柔降低透明度（`.ledger-refreshing`），数据到达后根据 `slideDir` 触发 `.animate-slide-from-left` / `.animate-slide-from-right` 或 `.animate-msg-in`。
3. **`LedgerQuickBar.tsx`**（<= 230 行）：
   - 保持在首屏显著位置（放在 `LedgerHeader` 下方或 `LedgerSummaryCards` 紧下方均可；建议 **`LedgerHeader` → `LedgerQuickBar` → `LedgerSummaryCards` → `LedgerEntryList`** 或 **`LedgerHeader` → `LedgerSummaryCards` → `LedgerQuickBar` → `LedgerEntryList`** —— 为兼顾“一眼看本月开销 + 零摩擦记账”，保持 `Header`（含醒目 `+ 记一笔`）→ `QuickBar`（紧凑单行随手一句/贴图/导入卡）→ `SummaryCards` → `EntryList` 更符合「打开就记、顺眼看数」的高频动线！）。
   - 在速记 `<input>` 上增加 `onPaste` 事件：检测到剪贴板中有图片文件时自动拦截并调用 `handleImages`，桌面端截图后 `Ctrl+V` 直接离线 OCR！
   - 副标题轻提示：`离线解析 · 不调用外部 AI · 支持 Ctrl+V 粘贴支付截图`。
4. **`LedgerEntryList.tsx`**（<= 240 行）：
   - 移除原本藏在工具栏最右侧的重复主色 `+ 记一笔` 按钮（已在 `LedgerHeader` 成为主 CTA；仅在列表为空的空状态里保留一个温和的「手动记一笔」文字按钮引导）。
   - 接收 `monthKey: string`、`refreshTick: number`、`slideDir: 'left' | 'right' | 'none'`：列表行（前 12 条）带有极轻盈的 `.animate-stagger-in`（`delay = min(idx, 10) * 24ms`），切换月份或刷新时与上方卡片动效节奏完全一致！
5. **`LedgerTab.tsx`**（<= 220 行）：
   - 维护 `refreshTick`（手动刷新递增）和 `slideDir`（切换月份比较新旧月自动判断 `'left'` / `'right'`，刷新设为 `'none'`）。
   - 监听 `LEDGER_UPDATED_EVENT`，当用户在全局 `QuickLedgerModal` 记账后自动无感刷新。
   - **重要体验细节**：切换月份时保留旧 `data` 并施加柔和 `loading` 态，不要把 `LedgerSummaryCards` 卸载成空白再重新撑开（避免页面高度剧烈跳动）。

---

## Stage C：清爽双态工作台重构（Hub 概览 + 沉浸式模块空间）

### C1. 新建 `frontend/src/components/workbench/WorkbenchHub.tsx`（~235 行）
让工作台真正像一个清爽、克制、有层次的「个人工作台」，而不是一排拥挤的顶部 Tab：

- **顶部极简 Header**：
  - 左侧：大标题 `工作台` + 当日日期副标题（如 `11月27日 · 周五`）
  - 右侧：两个干净的胶囊动作按钮：
    - 若 `ledgerEnabled`：主色按钮 **`+ 随手记一笔`**（`Wallet` / `Plus` 图标，点击触发 `onOpenQuickLedger`）
    - 次级按钮 **`管理扩展`**（`SlidersHorizontal` 图标，点击打开 `ModuleManagerModal`）
- **上半屏 Bento 概览双栏（`grid gap-4 lg:grid-cols-2`）**：
  - **左卡：今日焦点速览卡片**
    - 自动并行拉取 `api.getFocus()`。
    - 顶栏：`Target` 图标 + `今日焦点` + 待办统计徽章（如 `剩余 N 项`）+ 右侧 `全部 ›` 按钮（点击进入 `#workbench/focus`）。
    - 主体：展示前 4 条未完成焦点事项，每条左侧有一个可直接点击勾选完成的圆形复选框（调用 `api.updateFocusItem(id, { done: true })` 并 toast 反馈！），右侧展示标题与简短优先级标记。全部完成时展示简洁空态。
  - **右卡：随手记账速览卡片**（当 `ledgerEnabled` 为 true 时展示）
    - 自动拉取 `api.getLedger()`，并监听 `LEDGER_UPDATED_EVENT` 实时更新。
    - 遵循用户保存在 `localStorage` 的隐藏金额状态（`donut_ledger_masked_${userId}`），并放一个小眼睛图标可快速切换。
    - 展示当前月名称、本月总支出（大字号 `tabular-nums` + `useAnimatedNumber`）、日均与笔数，以及预算微进度条（若设置了预算）。
    - 底部两个清晰动作：`随手记一笔`（打开 `QuickLedgerModal`）与 `进入账本 ›`（进入 `#workbench/ledger`）。
  - *(若 `ledgerEnabled` 为 false，右卡优雅替换为「定时任务与扩展状态卡」，展示已启用的模块数与直达「定时任务」入口，保持双栏对称)*。
- **下半屏：「我的工具」整齐磁贴网格（`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`）**：
  - 统一展示所有已启用模块（核心模块 `今日焦点`、`定时任务` + 已开启扩展如 `随手记账`、`报销台账`、所有 AI 微应用）。
  - 每个磁贴卡片（`rounded-2xl p-4`，`--bg-surface` + `1px solid var(--border-subtle)`，hover 时柔和抬升/高亮边框，带 `pressable`）：
    - 左侧 `w-10 h-10 rounded-xl` 柔和图标底座（`--bg-elevated`）+ `<WorkbenchIcon />`
    - 中间标题 + 1 行描述（`line-clamp-1`，若无描述提供清晰默认文案）
    - 右上角极淡小标签（`核心` / `官方插件` / `微应用`）+ 右侧 `ChevronRight` 细微箭头
    - `data-testid="workbench-card-${m.id}"`
  - 末尾附加一张虚线柔和卡片 `+ 管理扩展与微应用`（点击打开 `ModuleManagerModal`）。

### C2. 新建 `frontend/src/components/workbench/WorkbenchBreadcrumb.tsx`（~125 行）
进入任意具体模块后的单行极简顶栏，彻底告别臃肿的顶部大 Tab 条：

- 高度紧凑（单行 `flex items-center justify-between gap-2`）：
  - **左侧**：
    - `← 工作台` 返回胶囊按钮（`ArrowLeft`，`data-testid="workbench-back-hub"`，点击回到 `#workbench`）
    - 斜杠分隔 `/`
    - **当前模块快速切换按钮**（显示 `<WorkbenchIcon />` + 模块名 + `ChevronDown`，`data-testid="workbench-module-switcher"`）：点击展开简洁下拉菜单（`animate-pop-up`），列出所有核心模块与已启用扩展，勾选当前项，一键切换其他模块，无需先退回总览！
  - **右侧**：
    - 轻量图标按钮 `SlidersHorizontal`（`title="管理扩展"`，`data-testid="workbench-manage-modules-btn"`）。

### C3. 重构 `frontend/src/components/WorkbenchView.tsx`（~160 行）
- 接收受控路由 props：
  - `activeModule: string | null`（来自 `App.tsx` 的 URL hash 状态：`null` 表示显示 `WorkbenchHub`，非空表示显示对应模块）
  - `onSelectModule: (moduleId: string | null) => void`
  - `onOpenQuickLedger?: () => void`
  - `onModulesUpdated?: (modules: WorkbenchModuleItem[]) => void`
- 当 `activeModule` 不在合法已启用模块中且模块列表加载完成时，柔和回退到 `null`（工作台总览 Hub）。
- 切换视图时给模块内容容器加 `key={activeModule || 'hub'}` + `animate-msg-in`，呈现丝滑页面转场。

### C4. Service Worker 缓存版本更新
- 将 `frontend/public/sw.js` 中的 `CACHE_NAME` 从 `donut-portal-shell-v23` 升级为 `donut-portal-shell-v24`。

---

## 验收与质量检查清单（每阶段结束必做）

1. 运行 `MSYS_NO_PATHCONV=1 wsl -d OpenClaw -u openclaw -- bash /mnt/d/OpenClaw/portal/scripts/build_portal_bundle.sh`，确保 `tsc -b && vite build` 退出码为 `0`。
2. 检查所有新增/修改的 `frontend/src/components/workbench/**` 及 `portalRoute.ts`：
   - 无任何文件超过 260 行（`App.tsx` / `ChatView.tsx` 除外，但对其只做小幅精准修改）。
   - 零 Emoji 字符出现在新 UI 组件中。
3. 检查 `git status --short` 干净无多余临时产物。
