---
name: ledger-bookkeeping
description: 随手记账官方技能。当用户要「记一笔账」「查本月花了多少」「消费分析/拿铁因子」「修改或删除账目」「设置月度预算」时使用。严格操作当前用户隔离的 vault/workbench/ledger.db。
---

# 随手记账操作规范（Official Ledger Plugin）

所有操作严格通过以下两个标准 CLI 完成，**严禁直接手写 SQL 或跨用户访问数据库**。

## 1. 记账 / 查明细 / 改删 / 设预算（`tools/ledger_entry.py`）

- 合法分类（11 类）：`餐饮`、`饮品零食`、`交通`、`购物`、`日用`、`娱乐`、`学习`、`医疗`、`居住`、`人情`、`其他`
- 合法支付方式：`微信`、`支付宝`、`银行卡`、`现金`、`其他`

```bash
# 记一笔（--date 默认今天 YYYY-MM-DD；重复指纹会被自动拦截，确认要重复再加 --force）
/home/donut/.openclaw/tools-venv/bin/python tools/ledger_entry.py add \
  --amount 32.5 --category 餐饮 --merchant "牛肉面" --method 微信 --date 2026-11-27 --note "午饭"

# 查看近期账目（支持按月过滤）
/home/donut/.openclaw/tools-venv/bin/python tools/ledger_entry.py list --month 2026-11 --limit 30

# 修改或删除某笔账目（先 list 拿到 id）
/home/donut/.openclaw/tools-venv/bin/python tools/ledger_entry.py update --id le_xxxx --amount 35 --category 餐饮
/home/donut/.openclaw/tools-venv/bin/python tools/ledger_entry.py delete --id le_xxxx

# 设置月度预算（设 0 表示取消）
/home/donut/.openclaw/tools-venv/bin/python tools/ledger_entry.py set-budget --amount 3000
```

## 2. 月度汇总与消费洞察（`tools/ledger_summary.py`）

```bash
# 只读汇总（返回总支出、日均、预算剩余、分类占比、高频小额拿铁因子、Top 消费）
/home/donut/.openclaw/tools-venv/bin/python tools/ledger_summary.py --month 2026-11 --top 5
```

## 3. 执行原则
- 用户说一句自然语言（如“刚买瑞幸 18 块”）直接落账并复述核对（日期、金额、分类、商户），不要反问多余字段。
- 涉及大额账单导入（微信/支付宝 CSV/XLSX）或消费截图，优先提醒用户可在工作台「随手记账」里走 0-Token 本地导入/离线 OCR。
