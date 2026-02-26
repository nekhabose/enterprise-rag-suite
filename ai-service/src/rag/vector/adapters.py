from __future__ import annotations
from typing import Any, Dict, List

from .base import BaseVectorStore


class InMemoryVectorStore(BaseVectorStore):
    name = "memory"

    def __init__(self) -> None:
        self._rows: List[Dict[str, Any]] = []

    def upsert(self, tenant_id: int, documents: List[Dict[str, Any]]) -> None:
        for doc in documents:
            self._rows.append({**doc, "tenant_id": tenant_id})

    def search(self, tenant_id: int, query_vector: List[float], top_k: int = 5) -> List[Dict[str, Any]]:
        del query_vector
        rows = [r for r in self._rows if r.get("tenant_id") == tenant_id]
        return rows[:top_k]
