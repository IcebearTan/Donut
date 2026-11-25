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


def list_user_vault_files(user_id: str) -> dict[str, list[dict[str, Any]]]:
    dirs = ensure_user_vault(user_id)
    out: dict[str, list[dict[str, Any]]] = {s: [] for s in VAULT_SCOPES}

    for scope in VAULT_SCOPES:
        base = dirs[scope]
        items: list[dict[str, Any]] = []
        for p in base.rglob("*"):
            if not p.is_file() or p.name.startswith("."):
                continue
            rel = p.relative_to(base).as_posix()
            st = p.stat()
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
        out[scope] = items[:80]

    # Also surface any legacy files in generated/<uid> under artifacts if not already present
    legacy_gen = GENERATED_DIR / user_id
    if legacy_gen.exists():
        seen = {x["name"] for x in out["artifacts"]}
        for p in legacy_gen.iterdir():
            if not p.is_file() or p.name.startswith(".") or p.name in seen:
                continue
            st = p.stat()
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

    return out


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
        name = slug
        desc = ""
        # Parse lightweight YAML frontmatter
        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) >= 3:
                for ln in parts[1].splitlines():
                    if ln.lower().startswith("name:"):
                        name = ln.split(":", 1)[1].strip().strip('"').strip("'") or slug
                    elif ln.lower().startswith("description:"):
                        desc = ln.split(":", 1)[1].strip().strip('"').strip("'")
        st = skill_md.stat()
        result.append(
            {
                "id": slug,
                "name": name,
                "description": desc,
                "updated_at": int(st.st_mtime * 1000),
            }
        )
    return result


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
