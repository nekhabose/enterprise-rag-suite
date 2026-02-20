"""
FAISS Vector Store Implementation
Fast similarity search using Facebook AI Similarity Search
"""
from .base_store import BaseVectorStore, SearchResult
from typing import List, Dict, Any, Optional
import numpy as np
import faiss
import pickle
import os

class FAISSVectorStore(BaseVectorStore):
    """
    FAISS vector store for fast local similarity search
    """
    
    def __init__(
        self,
        dimension: int,
        index_type: str = "IVFFlat",
        nlist: int = 100,
        storage_path: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize FAISS vector store
        
        Args:
            dimension: Vector dimension
            index_type: Index type (Flat, IVFFlat, HNSW)
            nlist: Number of clusters for IVF
            storage_path: Path to save/load index
        """
        super().__init__(
            dimension=dimension,
            index_type=index_type,
            nlist=nlist,
            storage_path=storage_path,
            **kwargs
        )
        
        self.dimension = dimension
        self.index_type = index_type
        self.nlist = nlist
        self.storage_path = storage_path or "faiss_index"
        
        # Storage for metadata
        self.ids = []
        self.metadata = []
        
        # Create index
        self._create_index()
        
        # Try to load existing index
        if os.path.exists(f"{self.storage_path}.index"):
            print(f"Loading existing FAISS index from {self.storage_path}")
            self.load()
        else:
            print(f"Created new FAISS index: {index_type}")
    
    def _create_index(self):
        """Create FAISS index based on type"""
        if self.index_type == "Flat":
            self.index = faiss.IndexFlatL2(self.dimension)
        
        elif self.index_type == "IVFFlat":
            quantizer = faiss.IndexFlatL2(self.dimension)
            self.index = faiss.IndexIVFFlat(
                quantizer,
                self.dimension,
                self.nlist
            )
            self.needs_training = True
        
        elif self.index_type == "HNSW":
            self.index = faiss.IndexHNSWFlat(self.dimension, 32)
            self.needs_training = False
        
        else:
            raise ValueError(f"Unknown index type: {self.index_type}")
    
    def add(
        self,
        ids: List[str],
        vectors: List[List[float]],
        metadata: List[Dict[str, Any]]
    ) -> bool:
        """
        Add vectors to FAISS index
        
        Args:
            ids: List of unique IDs
            vectors: List of embedding vectors
            metadata: List of metadata dicts
            
        Returns:
            True if successful
        """
        try:
            self.validate_vectors(vectors)
            
            # Convert to numpy array
            vectors_array = np.array(vectors).astype('float32')
            
            # Train index if needed
            if hasattr(self, 'needs_training') and self.needs_training:
                if not self.index.is_trained:
                    print(f"Training FAISS index with {len(vectors)} vectors...")
                    self.index.train(vectors_array)
                    self.needs_training = False
            
            # Add vectors
            self.index.add(vectors_array)
            
            # Store metadata
            self.ids.extend(ids)
            self.metadata.extend(metadata)
            
            print(f"✅ Added {len(vectors)} vectors to FAISS")
            
            return True
            
        except Exception as e:
            print(f"❌ FAISS add error: {str(e)}")
            return False
    
    def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        filter: Optional[Dict] = None
    ) -> List[SearchResult]:
        """
        Search for similar vectors
        
        Args:
            query_vector: Query embedding vector
            top_k: Number of results to return
            filter: Optional metadata filter (not supported in basic FAISS)
            
        Returns:
            List of search results
        """
        try:
            # Convert to numpy array
            query_array = np.array([query_vector]).astype('float32')
            
            # Search
            distances, indices = self.index.search(query_array, top_k)
            
            # Convert to SearchResult objects
            results = []
            for distance, idx in zip(distances[0], indices[0]):
                if idx < len(self.metadata) and idx >= 0:
                    results.append(SearchResult(
                        id=self.ids[idx],
                        score=float(distance),
                        metadata=self.metadata[idx],
                        content=self.metadata[idx].get('content', '')
                    ))
            
            return results
            
        except Exception as e:
            print(f"❌ FAISS search error: {str(e)}")
            return []
    
    def delete(self, ids: List[str]) -> bool:
        """
        Delete vectors (not efficiently supported in FAISS)
        Would require rebuilding index
        """
        print("⚠️  Delete not efficiently supported in FAISS")
        return False
    
    def get_count(self) -> int:
        """Get total number of vectors"""
        return self.index.ntotal
    
    def save(self) -> bool:
        """Save index to disk"""
        try:
            # Save index
            faiss.write_index(self.index, f"{self.storage_path}.index")
            
            # Save metadata
            with open(f"{self.storage_path}.meta", 'wb') as f:
                pickle.dump({
                    'ids': self.ids,
                    'metadata': self.metadata
                }, f)
            
            print(f"✅ Saved FAISS index to {self.storage_path}")
            return True
            
        except Exception as e:
            print(f"❌ Save error: {str(e)}")
            return False
    
    def load(self) -> bool:
        """Load index from disk"""
        try:
            # Load index
            self.index = faiss.read_index(f"{self.storage_path}.index")
            
            # Load metadata
            with open(f"{self.storage_path}.meta", 'rb') as f:
                data = pickle.load(f)
                self.ids = data['ids']
                self.metadata = data['metadata']
            
            print(f"✅ Loaded FAISS index from {self.storage_path}")
            return True
            
        except Exception as e:
            print(f"❌ Load error: {str(e)}")
            return False
    
    def get_name(self) -> str:
        """Get store name"""
        return f"faiss_{self.index_type.lower()}"
    
    def get_description(self) -> str:
        """Get store description"""
        return f"FAISS {self.index_type} index ({self.dimension}d)"
