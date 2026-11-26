from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import Any

from .config import GENERATED_DIR, UPLOAD_DIR, VAULT_DIR
from .persona import get_agent_workspace

VAULT_SCOPES = ("inbox", "artifacts", "archive")

BLOCKED_UPLOAD_EXTS = {
    ".exe",
    ".msi",
    ".dll",
    ".bat",
    ".cmd",
    ".com",
    ".scr",
    ".pif",
    ".vbs",
    ".ps1",
}


def is_allowed_upload_ext(ext: str) -> bool:
    return ext.lower() not in BLOCKED_UPLOAD_EXTS


def ensure_user_vault(user_id: str) -> dict[str, Path]:
    """
    Create strictly isolated per-user vault directories:
      vault/<uid>/inbox     -> uploaded images & documents
      vault/<uid>/artifacts -> Donut-generated PDFs / Excel / reports
      vault/<uid>/archive   -> long-term categorized files (e.g. invoices/2026-11/)
    Also ensures a `vault` symlink inside the user's OpenClaw workspace so Donut
    sees ONLY this user's own vault natively at `vault/...`.
    """
    root = VAULT_DIR / user_id
    dirs: dict[str, Path] = {}
    for scope in VAULT_SCOPES:
        d = root / scope
        d.mkdir(parents=True, exist_ok=True)
        dirs[scope] = d

    # Keep workspace/vault symlink in sync (isolated per user)
    try:
        ws = get_agent_workspace(user_id)
        link = ws / "vault"
        if not link.exists() and not link.is_symlink():
            os.symlink(str(root), str(link))
    except OSError:
        pass

    return dirs


def sanitize_filename(original_name: str, fallback_ext: str = "") -> str:
    stem = Path(original_name).stem
    ext = Path(original_name).suffix.lower() or fallback_ext.lower()
    # Keep Chinese chars, letters, digits, hyphens, underscores
    clean_stem = re.sub(r"[^\w\u4e00-\u9fff-]+", "_", stem).strip("_")[:48]
    if not clean_stem:
        clean_stem = f"file_{uuid.uuid4().hex[:8]}"
    return f"{clean_stem}{ext}"


def resolve_vault_file(user_id: str, scope: str, rel_path: str) -> Path | None:
    if scope not in VAULT_SCOPES:
        return None
    if not rel_path or ".." in rel_path or rel_path.startswith("/") or "\\" in rel_path:
        return None
    dirs = ensure_user_vault(user_id)
    base = dirs[scope].resolve()
    target = (base / rel_path).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        return None
    return target


def list_user_vault_files(user_id: str) -> dict[str, Any]:
    dirs = ensure_user_vault(user_id)
    out: dict[str, Any] = {s: [] for s in VAULT_SCOPES}
    total_size = 0

    for scope in VAULT_SCOPES:
        base = dirs[scope]
        items: list[dict[str, Any]] = []
        for p in base.rglob("*"):
            if not p.is_file() or p.name.startswith("."):
                continue
            rel = p.relative_to(base).as_posix()
            st = p.stat()
            total_size += st.st_size
            items.append(
                {
                    "scope": scope,
                    "path": rel,
                    "name": p.name,
                    "ext": p.suffix.lower(),
                    "size": st.st_size,
                    "updated_at": int(st.st_mtime * 1000),
                    "url": f"/portal-api/vault/download/{scope}/{rel}",
                }
            )
        items.sort(key=lambda x: x["updated_at"], reverse=True)
        out[scope] = items[:200]

    # Collect archive subdirectories (including newly scaffolded project folders!)
    archive_base = dirs["archive"]
    archive_folders: list[str] = []
    if archive_base.exists():
        for d in sorted(archive_base.rglob("*")):
            if d.is_dir() and not d.name.startswith("."):
                archive_folders.append(d.relative_to(archive_base).as_posix())
    out["archive_folders"] = archive_folders

    # Also surface any legacy files in generated/<uid> under artifacts if not already present
    legacy_gen = GENERATED_DIR / user_id
    if legacy_gen.exists():
        seen = {x["name"] for x in out["artifacts"]}
        for p in legacy_gen.iterdir():
            if not p.is_file() or p.name.startswith(".") or p.name in seen:
                continue
            st = p.stat()
            total_size += st.st_size
            out["artifacts"].append(
                {
                    "scope": "artifacts",
                    "path": p.name,
                    "name": p.name,
                    "ext": p.suffix.lower(),
                    "size": st.st_size,
                    "updated_at": int(st.st_mtime * 1000),
                    "url": f"/portal-api/files/{p.name}",
                }
            )
        out["artifacts"].sort(key=lambda x: x["updated_at"], reverse=True)

    out["total_size"] = total_size
    return out


_SKILL_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,48}$")


def _parse_skill_frontmatter(slug: str, text: str) -> tuple[str, str]:
    name = slug
    desc = ""
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            for ln in parts[1].splitlines():
                if ln.lower().startswith("name:"):
                    name = ln.split(":", 1)[1].strip().strip('"').strip("'") or slug
                elif ln.lower().startswith("description:"):
                    desc = ln.split(":", 1)[1].strip().strip('"').strip("'")
    return name, desc


def list_user_skills(user_id: str) -> list[dict[str, Any]]:
    """Read self-evolved workspace skills strictly from this user's own OpenClaw workspace."""
    ws = get_agent_workspace(user_id)
    skills_dir = ws / "skills"
    if not skills_dir.exists():
        return []
    result: list[dict[str, Any]] = []
    for skill_md in sorted(skills_dir.glob("*/SKILL.md")):
        slug = skill_md.parent.name
        try:
            text = skill_md.read_text(encoding="utf-8")
        except Exception:
            continue
        name, desc = _parse_skill_frontmatter(slug, text)
        st = skill_md.stat()
        result.append(
            {
                "id": slug,
                "name": name,
                "description": desc,
                "updated_at": int(st.st_mtime * 1000),
                "size": st.st_size,
            }
        )
    result.sort(key=lambda x: x["updated_at"], reverse=True)
    return result


def read_user_skill(user_id: str, skill_id: str) -> dict[str, Any] | None:
    if not _SKILL_SLUG_RE.fullmatch(skill_id):
        return None
    ws = get_agent_workspace(user_id)
    skill_md = ws / "skills" / skill_id / "SKILL.md"
    if not skill_md.exists() or not skill_md.is_file():
        return None
    text = skill_md.read_text(encoding="utf-8")
    name, desc = _parse_skill_frontmatter(skill_id, text)
    st = skill_md.stat()
    return {
        "id": skill_id,
        "name": name,
        "description": desc,
        "content": text,
        "updated_at": int(st.st_mtime * 1000),
        "size": st.st_size,
    }


def save_user_skill(user_id: str, skill_id: str, content: str) -> dict[str, Any] | None:
    if not _SKILL_SLUG_RE.fullmatch(skill_id):
        return None
    ws = get_agent_workspace(user_id)
    skill_dir = ws / "skills" / skill_id
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_md = skill_dir / "SKILL.md"
    clean = content.rstrip() + "\n"
    skill_md.write_text(clean, encoding="utf-8")
    name, desc = _parse_skill_frontmatter(skill_id, clean)
    st = skill_md.stat()
    return {
        "id": skill_id,
        "name": name,
        "description": desc,
        "content": clean,
        "updated_at": int(st.st_mtime * 1000),
        "size": st.st_size,
    }


def delete_user_skill(user_id: str, skill_id: str) -> bool:
    if not _SKILL_SLUG_RE.fullmatch(skill_id):
        return False
    ws = get_agent_workspace(user_id)
    skill_dir = ws / "skills" / skill_id
    if not skill_dir.exists() or not skill_dir.is_dir():
        return False
    import shutil

    shutil.rmtree(skill_dir, ignore_errors=False)
    return True


def list_user_tools(user_id: str) -> list[dict[str, Any]]:
    ws = get_agent_workspace(user_id)
    tools_dir = ws / "tools"
    if not tools_dir.exists():
        return []
    out: list[dict[str, Any]] = []
    for p in sorted(tools_dir.iterdir()):
        if not p.is_file() or p.name.startswith("."):
            continue
        st = p.stat()
        out.append(
            {
                "name": p.name,
                "size": st.st_size,
                "updated_at": int(st.st_mtime * 1000),
            }
        )
    return out


def resolve_attachment_path(user_id: str, file_id: str) -> tuple[Path | None, str, bool]:
    """
    Resolve an uploaded attachment ID from either vault/<uid>/inbox/ or legacy uploads/<uid>/.
    Returns (path, download_url, is_image).
    """
    if "/" in file_id or "\\" in file_id or ".." in file_id or not file_id:
        return None, "", False

    dirs = ensure_user_vault(user_id)
    p_vault = dirs["inbox"] / file_id
    if p_vault.exists() and p_vault.is_file():
        is_img = p_vault.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif"}
        return p_vault, f"/portal-api/vault/download/inbox/{file_id}", is_img

    p_legacy = UPLOAD_DIR / user_id / file_id
    if p_legacy.exists() and p_legacy.is_file():
        return p_legacy, f"/portal-api/uploads/{file_id}", True

    return None, "", False
