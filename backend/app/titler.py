from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Optional

import httpx


def _load_fast_llm_config() -> Optional[tuple[str, str, str]]:
    """
    Read direct OpenAI-compatible fast model credentials from OpenClaw config
    so auto-titling uses ~120 tokens (<0.6s, ~¥0.0001) without loading the
    full OpenClaw system prompt & tool schemas.
    """
    oc_cfg = Path(os.environ.get("OPENCLAW_HOME", str(Path.home()))) / ".openclaw" / "openclaw.json"
    if not oc_cfg.exists():
        return None
    try:
        data = json.loads(oc_cfg.read_text(encoding="utf-8"))
        providers = data.get("models", {}).get("providers", {})
        if not isinstance(providers, dict):
            return None

        # Prefer deepseek fast model first, then any openai-completions provider with apiKey
        ordered = []
        if "deepseek" in providers:
            ordered.append(("deepseek", providers["deepseek"]))
        for k, v in providers.items():
            if k != "deepseek":
                ordered.append((k, v))

        for _name, p in ordered:
            if not isinstance(p, dict):
                continue
            base_url = str(p.get("baseUrl") or "").rstrip("/")
            api_key = str(p.get("apiKey") or "").strip()
            models = p.get("models") or []
            if not base_url or not api_key or not models:
                continue
            model_ids = [str(m.get("id")) for m in models if isinstance(m, dict) and m.get("id")]
            if not model_ids:
                continue
            chosen = next((m for m in model_ids if "flash" in m.lower() or "chat" in m.lower()), model_ids[0])
            return base_url, api_key, chosen
    except Exception:
        return None
    return None


def _clean_title(raw: str) -> str:
    text = (raw or "").strip()
    # Take first non-empty line only
    for line in text.splitlines():
        line = line.strip()
        if line:
            text = line
            break
    # Remove common wrappers, markdown, prefixes, and trailing punctuation
    text = re.sub(r"^(标题|对话标题|主题)\s*[:：]\s*", "", text)
    text = text.strip(" \t\n\r\"'“”‘’《》【】[]()（）`*_#·-—")
    text = re.sub(r"[。！？!?,，；;：:…\.]+$", "", text).strip()
    if len(text) > 22:
        text = text[:22].strip()
    return text


async def generate_smart_title(
    user_text: str,
    assistant_text: str = "",
) -> Optional[str]:
    """Generate a crisp 4-12 Chinese char ChatGPT-style conversation title."""
    u_excerpt = (user_text or "").strip().replace("\n", " ")[:400]
    a_excerpt = (assistant_text or "").strip().replace("\n", " ")[:500]
    if not u_excerpt and not a_excerpt:
        return None

    cfg = _load_fast_llm_config()
    if not cfg:
        return None

    base_url, api_key, model_id = cfg
    prompt_user = f"用户：{u_excerpt}"
    if a_excerpt:
        prompt_user += f"\n助手：{a_excerpt}"

    payload = {
        "model": model_id,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是一个极简对话标题提炼器。请根据下面这轮对话内容，"
                    "像 ChatGPT 侧边栏那样提炼一个准确、自然、简洁的中文标题"
                    "（4到12个字，可含必要英文专有名词如 Notion、PDF、Excel）。"
                    "禁止加引号、书名号、句号、冒号或任何解释，只输出标题本身。"
                ),
            },
            {"role": "user", "content": prompt_user},
        ],
        "temperature": 0.2,
        "max_tokens": 36,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            choices = data.get("choices") or []
            if not choices:
                return None
            msg = choices[0].get("message") or {}
            content = str(msg.get("content") or "")
            cleaned = _clean_title(content)
            return cleaned if len(cleaned) >= 2 else None
    except Exception:
        return None
