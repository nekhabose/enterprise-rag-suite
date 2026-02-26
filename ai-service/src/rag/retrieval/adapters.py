from __future__ import annotations
from typing import Dict, List

from .base import BaseRetriever


class HybridRetriever(BaseRetriever):
    mode = "hybrid"

    def retrieve(self, tenant_id: int, query: str, top_k: int = 5) -> List[Dict]:
        return [
            {
                "tenant_id": tenant_id,
                "snippet": f"Relevant grounded snippet for: {query}",
                "source": "ingest://placeholder",
                "score": 0.91,
            }
        ][:top_k]
