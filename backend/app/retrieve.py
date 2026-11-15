"""Retrieval strategies. All return [{payload..., score}] best first.
  dense         semantic vectors (meaning)
  bm25          sparse keyword vectors (exact terms, IDF-weighted)
  hybrid        dense + bm25, fused with Reciprocal Rank Fusion inside Qdrant
  hybrid_rerank hybrid top-20 → cross-encoder (bge-reranker-v2-m3) → top-k
  multi_query   LLM rewrites the query 3 ways → hybrid each → our own RRF → rerank
"""
from pydantic import BaseModel
from qdrant_client import models as qm
from app.config import COLLECTION
from app.store import client, embed, embed_sparse, rerank

CANDIDATES = 20
MODES = ("dense", "bm25", "hybrid", "hybrid_rerank", "multi_query")


def _filter(filters: dict) -> qm.Filter | None:
    must = [qm.FieldCondition(key=f, match=qm.MatchValue(value=v)) for f, v in filters.items()]
    return qm.Filter(must=must) if must else None


def _hits(points) -> list[dict]:
    return [p.payload | {"score": round(p.score, 4)} for p in points]


def rrf(rankings: list[list[str]], k: int = 60) -> dict[str, float]:
    """Reciprocal Rank Fusion: score(d) = Σ 1/(k + rank). Uses ranks only, so no score normalisation
    is needed across retrievers with incomparable scales (cosine vs BM25). k=60 damps the top-rank advantage."""
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, key in enumerate(ranking, 1):
            scores[key] = scores.get(key, 0.0) + 1 / (k + rank)
    return dict(sorted(scores.items(), key=lambda x: -x[1]))


def _rerank(query: str, hits: list[dict], k: int, which: str = "bge") -> list[dict]:
    scores = rerank(query, [h["text"] for h in hits], which)
    return [h | {"score": round(float(s), 4), "pre_rerank_score": h["score"]}
            for s, h in sorted(zip(scores, hits), key=lambda x: -x[0])][:k]


def _hybrid(query: str, limit: int, flt) -> list[dict]:
    pts = client().query_points(COLLECTION, prefetch=[
        qm.Prefetch(query=embed([query])[0], using="dense", limit=CANDIDATES, filter=flt),
        qm.Prefetch(query=embed_sparse([query], query=True)[0], using="bm25", limit=CANDIDATES, filter=flt)],
        query=qm.FusionQuery(fusion=qm.Fusion.RRF), limit=limit).points
    return _hits(pts)


class Rewrites(BaseModel):
    queries: list[str]


def _multi_query(query: str, k: int, flt) -> list[dict]:
    from app.llm import FAST_MODEL, chat
    rw = chat([{"role": "system", "content": "Rewrite the search query 3 different ways for a document search engine over space-mission documents: "
                                             "one keyword-style, one paraphrase, one more specific. Keep codes/IDs verbatim."},
               {"role": "user", "content": query}], schema=Rewrites, model=FAST_MODEL, max_tokens=400, tag="rewrite").queries[:3]
    pool, rankings = {}, []
    for q in [query, *rw]:
        hs = _hybrid(q, CANDIDATES, flt)
        rankings.append([h["source"] + "#" + str(h["chunk"]) for h in hs])
        pool.update({h["source"] + "#" + str(h["chunk"]): h for h in hs})
    fused = [pool[key] | {"score": round(s, 4)} for key, s in list(rrf(rankings).items())[:CANDIDATES]]
    return _rerank(query, fused, k, "minilm")


def search(query: str, k: int = 5, mode: str = "dense", reranker: str = "minilm", **filters) -> list[dict]:
    flt = _filter(filters)
    c = client()
    if mode == "dense":
        return _hits(c.query_points(COLLECTION, query=embed([query])[0], using="dense", query_filter=flt, limit=k).points)
    if mode == "bm25":
        return _hits(c.query_points(COLLECTION, query=embed_sparse([query], query=True)[0], using="bm25", query_filter=flt, limit=k).points)
    if mode == "hybrid":
        return _hybrid(query, k, flt)
    if mode == "hybrid_rerank":
        return _rerank(query, _hybrid(query, CANDIDATES, flt), k, reranker)
    if mode == "multi_query":
        return _multi_query(query, k, flt)
    raise ValueError(f"unknown mode {mode}; one of {MODES}")


if __name__ == "__main__":
    r = rrf([["a", "b", "c"], ["c", "a", "d"]])
    assert list(r)[:2] == ["a", "c"] and abs(r["a"] - (1 / 61 + 1 / 62)) < 1e-12
    print("rrf ok")
