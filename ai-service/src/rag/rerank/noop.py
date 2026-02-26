from __future__ import annotations
from typing import Dict, List

from .base import BaseReranker


class NoopReranker(BaseReranker):
    def rerank(self, items: List[Dict]) -> List[Dict]:
        return items
