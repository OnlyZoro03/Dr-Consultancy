"""
RAG (Retrieval-Augmented Generation) engine.

Retrieves relevant medical context from the local FAISS vector store and
formats it as a text block that can be injected into the Gemini prompt.
"""

from services.vector_store import retrieve_medical_context

# Similarity threshold — only include documents whose cosine score is above this.
# all-MiniLM-L6-v2 cosine scores typically fall in [0.0, 1.0] after normalisation.
_MIN_SCORE_THRESHOLD = 0.25


def build_rag_context_block(query: str, top_k: int = 3) -> str:
    """
    Return a formatted Medical Context string to inject into the Gemini prompt.

    If no relevant documents are found (empty query, low scores, or missing
    dependencies), returns an empty string so the prompt degrades gracefully.
    """
    if not query or not query.strip():
        return ''

    docs = retrieve_medical_context(query.strip(), top_k=top_k)

    # Filter by relevance score
    relevant = [d for d in docs if d.get('score', 0) >= _MIN_SCORE_THRESHOLD]

    if not relevant:
        return ''

    lines = ['=== MEDICAL REFERENCE CONTEXT ===']
    for i, doc in enumerate(relevant, start=1):
        lines.append(
            f"[Reference {i} — {doc['topic']}]\n{doc['content']}\n(Source: {doc['source']})"
        )
    lines.append('=== END MEDICAL REFERENCE CONTEXT ===')

    return '\n\n'.join(lines)
