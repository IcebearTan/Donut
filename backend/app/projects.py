from __future__ import annotations

import datetime
import re
import shutil
import uuid
from pathlib import Path
from typing import Any

from .persona import get_agent_workspace


def get_projects_root(user_id: str) -> Path:
    root = get_agent_workspace(user_id) / "projects"
    root.mkdir(parents=True, exist_ok=True)
    return root


def make_safe_slug(name: str, existing_slugs: set[str]) -> str:
    # Preserve Chinese characters, letters, digits, hyphens and underscores for human-readable Markdown folders
    cleaned = re.sub(r'[\\/:*?"<>|.\s]+', "-", name.strip())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    if not cleaned:
        cleaned = f"project-{uuid.uuid4().hex[:6]}"
    cleaned = cleaned[:40]
    candidate = cleaned
    n = 2
    while candidate in existing_slugs or candidate.startswith("_"):
        candidate = f"{cleaned}-{n}"
        n += 1
    return candidate


def get_project_dir(user_id: str, slug: str) -> Path:
    if "/" in slug or "\\" in slug or ".." in slug or not slug:
        raise ValueError("Invalid project slug")
    pdir = get_projects_root(user_id) / slug
    pdir.mkdir(parents=True, exist_ok=True)
    return pdir


def ensure_project_files(
    user_id: str,
    slug: str,
    name: str,
    summary: str = "",
    brief_md: str | None = None,
    memory_md: str | None = None,
) -> dict[str, Any]:
    pdir = get_project_dir(user_id, slug)
    brief_path = pdir / "BRIEF.md"
    mem_path = pdir / "MEMORY.md"

    if brief_md is not None:
        brief_path.write_text(
            brief_md.strip() + "\n" if brief_md.strip() else "", encoding="utf-8"
        )
    elif not brief_path.exists():
        starter_brief = (
            f"# {name}\n\n"
            f"## 项目目标与背景\n"
            f"{summary.strip() or '（在这里补充项目背景、核心目标、关键约束与偏好）'}\n\n"
            f"## 关键规范 / 约束\n"
            f"- \n"
        )
        brief_path.write_text(starter_brief, encoding="utf-8")

    if memory_md is not None:
        mem_path.write_text(
            memory_md.strip() + "\n" if memory_md.strip() else "", encoding="utf-8"
        )
    elif not mem_path.exists():
        starter_mem = (
            f"# {name} · 项目记忆\n\n"
            f"这里沉淀本项目的重要决策、阶段进度与后续待办，每次新对话都会自动继承。\n"
        )
        mem_path.write_text(starter_mem, encoding="utf-8")

    return read_project_files(user_id, slug)


def read_project_files(user_id: str, slug: str) -> dict[str, Any]:
    pdir = get_project_dir(user_id, slug)
    brief_path = pdir / "BRIEF.md"
    mem_path = pdir / "MEMORY.md"
    brief_md = brief_path.read_text(encoding="utf-8") if brief_path.exists() else ""
    memory_md = mem_path.read_text(encoding="utf-8") if mem_path.exists() else ""
    mem_mtime = int(mem_path.stat().st_mtime * 1000) if mem_path.exists() else None
    return {
        "brief_md": brief_md,
        "memory_md": memory_md,
        "memory_updated_at": mem_mtime,
    }


def append_project_memory(user_id: str, slug: str, note_md: str) -> str:
    pdir = get_project_dir(user_id, slug)
    mem_path = pdir / "MEMORY.md"
    existing = mem_path.read_text(encoding="utf-8").rstrip() if mem_path.exists() else ""
    tz = datetime.timezone(datetime.timedelta(hours=8))
    stamp = datetime.datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    block = f"\n\n## {stamp} 对话沉淀\n\n{note_md.strip()}\n"
    updated = (existing + block).lstrip()
    mem_path.write_text(updated, encoding="utf-8")
    return updated


def archive_project_dir(user_id: str, slug: str) -> None:
    root = get_projects_root(user_id)
    pdir = root / slug
    if not pdir.exists():
        return
    archive_root = root / "_archived"
    archive_root.mkdir(parents=True, exist_ok=True)
    dest = archive_root / f"{slug}-{uuid.uuid4().hex[:6]}"
    shutil.move(str(pdir), str(dest))


def rebuild_projects_index(user_id: str, projects: list[dict[str, Any]]) -> str:
    """Regenerate projects/_index.md — the lightweight cross-project navigation map."""
    root = get_projects_root(user_id)
    lines = [
        "# 我的项目地图（Project Index）",
        "",
        "这是当前主人的个人项目总览。当对话涉及以下任意项目时，可直接读写对应目录下的 `BRIEF.md` 与 `MEMORY.md`。",
        "",
    ]
    if not projects:
        lines.append("（当前暂未创建项目）")
    else:
        for p in projects:
            slug = p["slug"]
            emoji = p.get("emoji") or "📁"
            name = p["name"]
            summary = (p.get("summary") or "").strip() or "暂无简介"
            lines.append(f"- **{emoji} {name}** (`projects/{slug}/`)：{summary}")
    content = "\n".join(lines).strip() + "\n"
    (root / "_index.md").write_text(content, encoding="utf-8")
    return content


def build_turn_instructions(
    user_id: str,
    active_project: dict[str, Any] | None,
    all_projects: list[dict[str, Any]],
) -> str:
    """
    Build concise OpenResponses `instructions` for each turn:
      - Inside a Project: focus deeply on that project's BRIEF.md + MEMORY.md
      - In Main Chat / General Chat: mount projects/_index.md so Donut can roam across all projects ("游龙")
    """
    if active_project is not None:
        slug = active_project["slug"]
        files = read_project_files(user_id, slug)
        brief = files["brief_md"].strip()[:2500]
        mem = files["memory_md"].strip()[-3500:]
        parts = [
            f"【当前项目空间：{active_project.get('emoji', '📁')} {active_project['name']}】",
            f"工作区路径：`projects/{slug}/BRIEF.md` 与 `projects/{slug}/MEMORY.md`。",
            "请紧扣本项目的背景与已有记忆来回答，保持上下文连续性。",
            "如果用户在本轮中作出了重要决策、更新了进度或让你记住某事，请主动使用工作区文件工具追加写入 `projects/"
            + slug
            + "/MEMORY.md`（不要覆盖旧记录）。",
            "",
            "--- BRIEF.md ---",
            brief or "（空）",
            "",
            "--- MEMORY.md（近期沉淀）---",
            mem or "（暂无沉淀）",
        ]
        return "\n".join(parts)

    # In Main Chat / standalone chat, keep system prompt prefix 100% STATIC for maximum DeepSeek KV-cache hit rate!
    # Static workspace AGENTS.md instructs Donut to read `projects/_index.md` on demand when the user mentions projects.
    return ""
