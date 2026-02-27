from __future__ import annotations
from typing import Dict, List, Optional, Any

from .base import BaseRetriever
from .postgres_retriever import PostgresKeywordRetriever


class HybridRetriever(BaseRetriever):
    mode = "hybrid"

    def __init__(self) -> None:
        self._retriever = PostgresKeywordRetriever()

    def retrieve(
        self,
        tenant_id: int,
        query: str,
        top_k: int = 5,
        course_id: Optional[int] = None,
        **kwargs: Any,
    ) -> List[Dict]:
        rows = self._retriever.retrieve(
            tenant_id=tenant_id,
            query=query,
            top_k=top_k,
            course_id=course_id,
            **kwargs,
        )
        return rows[:top_k] if rows else []
