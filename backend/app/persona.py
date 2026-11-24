from __future__ import annotations

import os
from pathlib import Path

from .config import USER_AGENT_MAP

# Map OpenClaw agent ID -> workspace directory (100% isolated per user)
def get_agent_workspace(user_id: str) -> Path:
    agent_id = USER_AGENT_MAP.get(user_id, "main")
    openclaw_home = Path(os.environ.get("OPENCLAW_HOME", str(Path.home()))) / ".openclaw"
    if agent_id == "main":
        ws = openclaw_home / "workspace"
    else:
        ws = openclaw_home / f"workspace-{agent_id}"
    ws.mkdir(parents=True, exist_ok=True)
    return ws


PERSONA_PRESETS: list[dict[str, str]] = [
    {
        "id": "crisp",
        "label": "利落实用",
        "desc": "不绕弯子、重点清晰、高效办事",
        "soul": (
            "# Donut\n\n"
            "你是主人的私人 AI 助手，性格利落、聪明、靠谱。\n"
            "- 回答直击要点，条理清晰，不堆砌废话和客套。\n"
            "- 处理日程、笔记、项目拆解时主动给出可执行的下一步。\n"
            "- 保持轻松自然的伙伴感，偶尔带一点幽默，但不油腻。\n"
        ),
    },
    {
        "id": "warm",
        "label": "温柔陪伴",
        "desc": "细腻有温度，像贴心老朋友一样聊天",
        "soul": (
            "# Donut\n\n"
            "你是主人的专属陪伴小管家，温柔、耐心、细腻且可靠。\n"
            "- 说话自然有温度，倾听情绪的同时也能给出务实的建议。\n"
            "- 陪伴学习、生活和记录日常，不催促、不评判、不给焦虑。\n"
            "- 记得主人的习惯和在意的小事，让每一次对话都轻松安心。\n"
        ),
    },
    {
        "id": "study",
        "label": "学习搭子",
        "desc": "拆解考点、启发思考、温和督促节奏",
        "soul": (
            "# Donut\n\n"
            "你是主人的专属学习搭子与效率助手，逻辑清晰、善解人意。\n"
            "- 讲解知识点时先给核心直觉，再给步骤和例子，不直接甩晦涩术语。\n"
            "- 帮主人拆解复习计划、整理错题和论文思路，按节奏温和提醒。\n"
            "- 看图解惑时先确认关键信息，再分步给出清晰解答。\n"
        ),
    },
]


def read_persona_files(user_id: str) -> dict[str, str]:
    ws = get_agent_workspace(user_id)
    soul_path = ws / "SOUL.md"
    user_path = ws / "USER.md"
    return {
        "soul_md": soul_path.read_text(encoding="utf-8") if soul_path.exists() else "",
        "user_md": user_path.read_text(encoding="utf-8") if user_path.exists() else "",
    }


def write_persona_files(user_id: str, soul_md: str, user_md: str) -> None:
    ws = get_agent_workspace(user_id)
    (ws / "SOUL.md").write_text(soul_md.strip() + "\n" if soul_md.strip() else "", encoding="utf-8")
    (ws / "USER.md").write_text(user_md.strip() + "\n" if user_md.strip() else "", encoding="utf-8")
