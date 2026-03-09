"""
FAISS-based vector store for medical knowledge retrieval.
Uses SentenceTransformers to embed documents and FAISS for approximate nearest-neighbour search.
Index is built lazily on the first call to retrieve_medical_context().
"""

import json
import os
import numpy as np

_model = None
_index = None
_documents = []   # list of raw document dicts: {topic, content, source}

# Path to the knowledge base JSON file
_DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'medical_knowledge.json')

# Embedding model — all-MiniLM-L6-v2 is small (80MB) and fast while still accurate
_MODEL_NAME = 'all-MiniLM-L6-v2'


def _load_documents() -> list[dict]:
    """Load and return the raw documents from medical_knowledge.json."""
    with open(_DATA_PATH, 'r', encoding='utf-8') as f:
        docs = json.load(f)
    return docs


def _build_index(documents: list[dict]):
    """Build the FAISS flat index from the document list."""
    # Import here so the module can be imported without these packages being available
    from sentence_transformers import SentenceTransformer
    import faiss

    global _model, _index, _documents

    model = SentenceTransformer(_MODEL_NAME)

    # Embed: combine topic + content so topic keywords also increase similarity
    texts = [f"{doc['topic']}: {doc['content']}" for doc in documents]
    embeddings = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
    embeddings = embeddings.astype('float32')

    dimension = embeddings.shape[1]
    # Inner-product index (cosine similarity because embeddings are normalised)
    index = faiss.IndexFlatIP(dimension)
    index.add(embeddings)

    _model = model
    _index = index
    _documents = documents


def _ensure_initialised():
    """Build the index once and reuse for all subsequent queries."""
    global _model, _index, _documents
    if _index is None:
        docs = _load_documents()
        _build_index(docs)


def retrieve_medical_context(query: str, top_k: int = 3) -> list[dict]:
    """
    Return the `top_k` most relevant document dicts for a given query string.

    Each returned dict has the shape:
        { "topic": str, "content": str, "source": str, "score": float }

    Falls back to an empty list if dependencies are missing or an error occurs.
    """
    try:
        _ensure_initialised()

        query_embedding = _model.encode(
            [query], convert_to_numpy=True, normalize_embeddings=True
        ).astype('float32')

        scores, indices = _index.search(query_embedding, top_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:   # FAISS returns -1 when there are fewer docs than top_k
                continue
            doc = dict(_documents[idx])
            doc['score'] = float(score)
            results.append(doc)

        return results

    except ImportError:
        # faiss-cpu or sentence-transformers not installed — degrade gracefully
        return []
    except Exception:
        return []
