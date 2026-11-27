---
name: reimbursement-manager
description: 报销台账官方技能。当用户要「登记报销」「查看待报销流水/总金额」「更新三单核对状态或报单进度」「关联发票附件路径」时使用。严格操作当前用户的 vault/archive/报销/ledger.csv。
---

# 报销台账操作规范（Official Reimbursement Plugin）

所有读写必须使用官方 CLI `tools/reimbursement_cli.py`（自动保证 UTF-8-BOM、原子写入与 Portal 固定 11 列格式），**禁止用文本替换或手写覆写 `ledger.csv`**。

## 1. 标准字段枚举
- 三单核对（`--invoice` / `--order` / `--payment`）：`有` | `无` | `金额不符` | `待开`
- 材料状态（`--material`）：`齐全` | `缺材料` | `待补` | `核对中`
- 报单状态（`--status`）：`待整理` | `已整理-未报销` | `已报销-未结款` | `已结款` | `取消报销`

## 2. 常用命令

```bash
# 查看报销台账与汇总金额（支持 --month YYYY-MM 和 --status 过滤）
/home/donut/.openclaw/tools-venv/bin/python tools/reimbursement_cli.py list
/home/donut/.openclaw/tools-venv/bin/python tools/reimbursement_cli.py list --month 2026-11 --status 待整理

# 新增一条报销流水（附件路径填相对 vault/archive/ 的路径，如 报销/2026-11/高铁票.pdf）
/home/donut/.openclaw/tools-venv/bin/python tools/reimbursement_cli.py add \
  --date 2026-11-27 --title "出差高铁票" --platform "12306" --amount 125.00 \
  --invoice 有 --order 有 --payment 有 --material 齐全 --status 已整理-未报销 \
  --attachment "报销/2026-11/12306-125"

# 更新已有行（先 list 获取 row_index）
/home/donut/.openclaw/tools-venv/bin/python tools/reimbursement_cli.py update \
  --row 3 --invoice 有 --material 齐全 --status 已报销-未结款

# 删除错误行
/home/donut/.openclaw/tools-venv/bin/python tools/reimbursement_cli.py delete --row 3
```

## 3. 归档约定
- 用户在对话上传的发票/订单/支付截图位于 `vault/inbox/`，整理时请归档至 `vault/archive/报销/YYYY-MM/`，并把相对路径写入 `--attachment`，这样工作台「报销台账」即可一键预览和打包 ZIP。
