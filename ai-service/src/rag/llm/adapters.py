from __future__ import annotations
from typing import Any, Optional
import re
import os

from .base import BaseLLM

import httpx


class MockProvider(BaseLLM):
    provider = "mock"

    def answer(self, prompt: str, **kwargs: Any) -> str:
        del kwargs
        parts = prompt.split("Context:", 1)
        context = parts[1].strip() if len(parts) > 1 else ""
        if not context:
            return "I could not find enough grounded course context to answer this question."

        clean = re.sub(r"\s+", " ", context).strip()
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean) if len(s.strip()) > 20]
        summary = " ".join(sentences[:2]) if sentences else clean[:300]
        if len(summary) > 420:
            summary = summary[:420].rstrip() + "..."
        return f"Based on your course materials: {summary}"


class TenantAwareProvider(BaseLLM):
    provider = "tenant-aware"

    def __init__(self) -> None:
        self._mock = MockProvider()

    def answer(self, prompt: str, **kwargs: Any) -> str:
        provider = str(kwargs.get("provider") or os.getenv("RAG_LLM_PROVIDER", "groq")).strip().lower()
        model = kwargs.get("model")
        temperature = float(kwargs.get("temperature") if kwargs.get("temperature") is not None else 0.2)
        max_tokens = int(kwargs.get("max_tokens") if kwargs.get("max_tokens") is not None else 500)

        if provider == "openai":
            return self._openai_answer(prompt, model=model, temperature=temperature, max_tokens=max_tokens)
        if provider == "groq":
            return self._groq_answer(prompt, model=model, temperature=temperature, max_tokens=max_tokens)

        # Unknown provider: keep deterministic fallback instead of crashing chat.
        return self._mock.answer(prompt)

    def _openai_answer(self, prompt: str, model: Optional[str], temperature: float, max_tokens: int) -> str:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if (not api_key) or api_key in {"your-openai-api-key", "sk-your-key"} or api_key.lower().startswith("your-"):
            raise RuntimeError("OPENAI_API_KEY missing")

        resolved_model = str(model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")).strip()
        if resolved_model.startswith("gpt-5"):
            # Keep compatibility for older Chat Completions-only runtime.
            resolved_model = "gpt-4.1-mini"

        payload = {
            "model": resolved_model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are an LMS course tutor. Use ONLY the provided context. "
                        "If the context is insufficient, say so briefly. Keep answer concise and clear."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": max(0.0, min(1.0, temperature)),
            "max_tokens": max(80, min(1200, max_tokens)),
        }
        with httpx.Client(timeout=45.0) as client:
            response = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
        return str(data["choices"][0]["message"]["content"]).strip()

    def _groq_answer(self, prompt: str, model: Optional[str], temperature: float, max_tokens: int) -> str:
        from groq import Groq

        api_key = os.getenv("GROQ_API_KEY", "").strip()
        if (not api_key) or api_key in {"your-groq-api-key"} or api_key.lower().startswith("your-"):
            raise RuntimeError("GROQ_API_KEY missing")
        resolved_model = str(model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")).strip()

        client = Groq(api_key=api_key)
        resp = client.chat.completions.create(
            model=resolved_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an LMS course tutor. Answer only from the provided context and keep the response focused."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=max(0.0, min(1.0, temperature)),
            max_tokens=max(80, min(1200, max_tokens)),
        )
        return str(resp.choices[0].message.content or "").strip()
