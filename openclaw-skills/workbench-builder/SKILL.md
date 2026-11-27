---
name: workbench-builder
description: 工作台造物与今日焦点同步技能。当用户要求「刷新/同步/添加今日焦点」「配置快捷入口」，或在工作台「做一个打卡清单/轻量台账/分类卡片/简报/互动小工具/微应用」时使用。免改源码、免重编译，直接写入当前用户隔离的 vault/workbench/ 目录。
---

# 工作台造物与焦点同步协议（Workbench Builder）

你拥有直接在 Donut 工作台创造个人模块和刷新「今日焦点」的能力。所有数据与扩展**严格隔离在当前用户工作区的 `vault/workbench/` 目录**下，绝不跨用户访问。

---

## 一、同步或修改「今日焦点」（`vault/workbench/focus.json`）

优先使用专属 CLI 工具 `tools/focus_sync.py`（自动原子写入当前用户的 `vault/workbench/focus.json`）：

```bash
# 查看当前今日焦点
/home/donut/.openclaw/tools-venv/bin/python tools/focus_sync.py list

# 新增一条焦点（urgency: must | soon | plan；tag_color: slate | blue | emerald | amber | rose | violet）
/home/donut/.openclaw/tools-venv/bin/python tools/focus_sync.py add \
  --title "提交 11 月差旅报销" \
  --urgency must \
  --tag "财务" \
  --tag-color rose \
  --countdown "今天 18:00" \
  --progress "三单已齐全，待上传系统" \
  --source-url "https://..."

# 批量刷新今日焦点（如每日 08:00 定时任务同步 Notion / 滴答 / 待办）
/home/donut/.openclaw/tools-venv/bin/python tools/focus_sync.py replace --keep-done --json '[
  {"title": "完成开题答辩 PPT 终稿", "urgency": "must", "tag": "论文", "tag_color": "rose", "countdown": "明天 10:00", "progress": "已完成 14/16 页"}
]'

# 勾选完成 / 删除单条 / 清理已完成
/home/donut/.openclaw/tools-venv/bin/python tools/focus_sync.py done <item_id>
/home/donut/.openclaw/tools-venv/bin/python tools/focus_sync.py delete <item_id>
/home/donut/.openclaw/tools-venv/bin/python tools/focus_sync.py clear-done

# 配置外部仓库快捷入口（如 Notion HQ、滴答清单）
/home/donut/.openclaw/tools-venv/bin/python tools/focus_sync.py set-links --json '[{"label":"Notion HQ","url":"https://www.notion.so/..."}]'
```

---

## 二、在工作台新建或更新微应用（`vault/workbench/apps/<app-id>/`）

### 目录与 ID 规范
- `<app-id>` 仅限小写字母、数字、连字符或下划线（正则 `^[a-z0-9][a-z0-9_-]{0,47}$`），不可使用保留词（`focus`、`cron`、`manage`、`modules`、`reimbursements`、`ledger`、`apps`、`schedule`）。
- 图标 `icon` 使用语义化矢量图标名（严禁 Emoji）：`pill`, `heart-pulse`, `check-square`, `table`, `layout-grid`, `file-text`, `book-open`, `calendar`, `wallet`, `dumbbell`, `coffee`, `target`, `list-todo`, `code`, `puzzle`, `sparkles`。

### 引擎 A · 声明式结构化模板（优先推荐！100% 原生质感与亮暗主题）
使用 `tools/workbench_app.py create-template` 一步生成 `manifest.json` + `data.json`：

1. **`checklist`（每日打卡 / 习惯清单）**：
```json
{
  "subtitle": "每天按时完成，保持状态",
  "reset_mode": "daily",
  "streak_days": 0,
  "items": [
    {"id": "vit-c", "title": "复合维生素", "group": "早晨", "note": "早餐后温水", "done": false}
  ]
}
```
> 设为 `"reset_mode": "daily"` 时，跨天打开工作台会自动归档昨日完成情况并重置今日勾选状态。

2. **`table`（轻量台账 / 记录表）**：
```json
{
  "columns": [
    {"key": "date", "label": "日期", "type": "date"},
    {"key": "item", "label": "项目", "type": "text"},
    {"key": "amount", "label": "金额", "type": "number"},
    {"key": "status", "label": "状态", "type": "select", "options": ["待处理", "已完成"]}
  ],
  "rows": [
    {"id": "r1", "date": "2026-11-26", "item": "示例记录", "amount": 50, "status": "已完成"}
  ]
}
```

3. **`cards`（分类卡片看板）**：
```json
{
  "categories": ["全部", "生活", "学习"],
  "cards": [
    {
      "id": "c1",
      "title": "年度体检清单",
      "category": "生活",
      "badge": "12月",
      "tone": "amber",
      "summary": "空腹抽血 + 超声检查",
      "fields": [{"label": "地点", "value": "体检中心"}],
      "url": "https://..."
    }
  ]
}
```

4. **`markdown`（动态简报 / 知识面板）**：
```json
{
  "title": "本周重点简报",
  "updated_label": "更新于 2026-11-26 08:00",
  "content": "## 核心进展\n- 完成阶段目标..."
}
```

示例命令：
```bash
/home/donut/.openclaw/tools-venv/bin/python tools/workbench_app.py create-template supplements \
  --name "每日保健品打卡" \
  --template checklist \
  --icon pill \
  --description "早晚营养补充记录" \
  --data-file /tmp/supplements.json
```

### 引擎 B · 受控沙箱 HTML 微应用（适合番茄钟、计算器、可视化交互）
当用户需求超越结构化模板时，编写单文件自包含 `index.html`（内联 CSS/JS，不依赖外链 CDN）：
- 样式直接使用宿主注入的 CSS 变量：`var(--bg-page)`, `var(--bg-surface)`, `var(--bg-elevated)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`, `var(--border-subtle)`, `var(--accent)`, `var(--accent-contrast)`, `var(--success)`, `var(--danger)`。
- 数据读写必须使用注入的 `window.DonutApp` Bridge（**禁止使用 `localStorage` 或直接请求 `/portal-api`**，沙箱无同源权限）：
  - `const data = await window.DonutApp.getData()`（或同步读 `window.DonutApp.getInitialData()`）
  - `await window.DonutApp.setData(nextObj)`（持久化回当前微应用隔离的 `data.json`）
  - `window.DonutApp.onThemeChange((theme) => ...)`
  - `window.DonutApp.toast('已保存')`
- 用命令生成并注册：
```bash
/home/donut/.openclaw/tools-venv/bin/python tools/workbench_app.py create-html pomodoro \
  --name "专注番茄钟" \
  --icon target \
  --description "25分钟沉浸计时与今日番茄数统计" \
  --html-file /tmp/pomodoro.html \
  --data-json '{"today_count": 0}'
```

创建完成后，告诉用户：**刷新工作台页面（或点击右上角「管理扩展」）即可立即看到并使用新模块！**
