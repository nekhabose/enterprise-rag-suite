from __future__ import annotations

from .base import BaseLLM


class MockProvider(BaseLLM):
    provider = "mock"

    def answer(self, prompt: str) -> str:
        return f"Grounded answer: {prompt[:220]}"
