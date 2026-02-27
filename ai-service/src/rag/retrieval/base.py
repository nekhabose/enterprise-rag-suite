from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any


class BaseRetriever(ABC):
    mode: str

    @abstractmethod
    def retrieve(
        self,
        tenant_id: int,
        query: str,
        top_k: int = 5,
        course_id: Optional[int] = None,
        **kwargs: Any,
    ) -> List[Dict]:
        raise NotImplementedError
