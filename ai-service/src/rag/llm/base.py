from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any


class BaseLLM(ABC):
    provider: str

    @abstractmethod
    def answer(self, prompt: str, **kwargs: Any) -> str:
        raise NotImplementedError
