export const AI_OPTIONS_CATALOG = {
  chunking: [
    'semantic',
    'fixed',
    'fixed_size',
    'overlap',
    'paragraph',
    'page_based',
    'parent_child',
    'sentence',
    'recursive',
  ],
  embedding: [
    'minilm',
    'openai',
    'cohere',
    'bge-base',
    'e5-large',
  ],
  llm: [
    'groq',
    'openai',
    'anthropic',
    'ollama',
    'gemini',
  ],
  retrieval: [
    'hybrid',
    'semantic',
    'keyword',
    'bm25',
  ],
  vector: [
    'postgres',
    'pgvector',
    'chroma',
    'chromadb',
    'pinecone',
    'faiss',
    'qdrant',
  ],
} as const;

export const TENANT_AI_POLICY_DEFAULTS = {
  allowed_chunking_strategies: [...AI_OPTIONS_CATALOG.chunking],
  allowed_embedding_models: [...AI_OPTIONS_CATALOG.embedding],
  allowed_llm_providers: [...AI_OPTIONS_CATALOG.llm],
  allowed_retrieval_strategies: [...AI_OPTIONS_CATALOG.retrieval],
  allowed_vector_stores: [...AI_OPTIONS_CATALOG.vector],
};
