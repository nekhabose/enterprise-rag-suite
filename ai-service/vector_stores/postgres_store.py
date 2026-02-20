"""
PostgreSQL + pgvector Vector Store Implementation
Uses existing database with pgvector extension
"""
from .base_store import BaseVectorStore, SearchResult
from typing import List, Dict, Any, Optional
import psycopg2
from psycopg2.extras import execute_values

class PostgresVectorStore(BaseVectorStore):
    """
    PostgreSQL + pgvector vector store (existing implementation wrapper)
    """
    
    def __init__(
        self,
        connection_string: str,
        table_name: str = "chunks",
        **kwargs
    ):
        """
        Initialize PostgreSQL vector store
        
        Args:
            connection_string: PostgreSQL connection string
            table_name: Table name for vectors
        """
        super().__init__(
            connection_string=connection_string,
            table_name=table_name,
            **kwargs
        )
        
        self.connection_string = connection_string
        self.table_name = table_name
        
        print(f"✅ PostgreSQL vector store initialized (table: {table_name})")
    
    def _get_connection(self):
        """Get database connection"""
        return psycopg2.connect(self.connection_string)
    
    def add(
        self,
        ids: List[str],
        vectors: List[List[float]],
        metadata: List[Dict[str, Any]]
    ) -> bool:
        """
        Add vectors to PostgreSQL
        
        Args:
            ids: List of unique IDs
            vectors: List of embedding vectors
            metadata: List of metadata dicts
            
        Returns:
            True if successful
        """
        try:
            self.validate_vectors(vectors)
            
            conn = self._get_connection()
            cur = conn.cursor()
            
            # Prepare data for insertion
            chunk_data = []
            for id, vector, meta in zip(ids, vectors, metadata):
                chunk_data.append((
                    meta.get('document_id'),
                    meta.get('video_id'),
                    meta.get('content', ''),
                    vector,
                    meta.get('chunk_index', 0),
                    meta.get('metadata', {})
                ))
            
            # Insert
            execute_values(cur, f"""
                INSERT INTO {self.table_name} (document_id, video_id, content, embedding, chunk_index, metadata)
                VALUES %s
            """, chunk_data)
            
            conn.commit()
            cur.close()
            conn.close()
            
            print(f"✅ Added {len(vectors)} vectors to PostgreSQL")
            return True
            
        except Exception as e:
            print(f"❌ PostgreSQL add error: {str(e)}")
            return False
    
    def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        filter: Optional[Dict] = None
    ) -> List[SearchResult]:
        """
        Search for similar vectors using pgvector
        
        Args:
            query_vector: Query embedding vector
            top_k: Number of results to return
            filter: Optional metadata filter (document_id, etc.)
            
        Returns:
            List of search results
        """
        try:
            conn = self._get_connection()
            cur = conn.cursor()
            
            # Build query
            query = f"""
                SELECT id, content, embedding <=> %s::vector as distance, metadata
                FROM {self.table_name}
            """
            
            # Add filter
            where_clauses = []
            params = [query_vector]
            
            if filter:
                if 'document_id' in filter:
                    where_clauses.append("document_id = %s")
                    params.append(filter['document_id'])
                if 'video_id' in filter:
                    where_clauses.append("video_id = %s")
                    params.append(filter['video_id'])
            
            if where_clauses:
                query += " WHERE " + " AND ".join(where_clauses)
            
            query += f" ORDER BY embedding <=> %s::vector LIMIT %s"
            params.extend([query_vector, top_k])
            
            cur.execute(query, params)
            results = cur.fetchall()
            
            # Convert to SearchResult objects
            search_results = []
            for row in results:
                search_results.append(SearchResult(
                    id=str(row[0]),
                    score=float(row[2]),
                    metadata=row[3] or {},
                    content=row[1]
                ))
            
            cur.close()
            conn.close()
            
            return search_results
            
        except Exception as e:
            print(f"❌ PostgreSQL search error: {str(e)}")
            return []
    
    def delete(self, ids: List[str]) -> bool:
        """
        Delete vectors by IDs
        
        Args:
            ids: List of IDs to delete
            
        Returns:
            True if successful
        """
        try:
            conn = self._get_connection()
            cur = conn.cursor()
            
            cur.execute(f"""
                DELETE FROM {self.table_name}
                WHERE id = ANY(%s)
            """, (ids,))
            
            conn.commit()
            cur.close()
            conn.close()
            
            print(f"✅ Deleted {len(ids)} vectors from PostgreSQL")
            return True
            
        except Exception as e:
            print(f"❌ PostgreSQL delete error: {str(e)}")
            return False
    
    def get_count(self) -> int:
        """Get total number of vectors"""
        try:
            conn = self._get_connection()
            cur = conn.cursor()
            
            cur.execute(f"SELECT COUNT(*) FROM {self.table_name}")
            count = cur.fetchone()[0]
            
            cur.close()
            conn.close()
            
            return count
        except:
            return 0
    
    def get_name(self) -> str:
        """Get store name"""
        return "postgres_pgvector"
    
    def get_description(self) -> str:
        """Get store description"""
        count = self.get_count()
        return f"PostgreSQL+pgvector (table: {self.table_name}, {count} vectors)"
