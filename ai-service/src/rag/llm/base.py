from __future__ import annotations
from abc import ABC, abstractmethod


class BaseLLM(ABC):
    provider: str

    @abstractmethod
    def answer(self, prompt: str) -> str:
        raise NotImplementedError
