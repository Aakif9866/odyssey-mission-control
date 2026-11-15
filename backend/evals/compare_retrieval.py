"""Compare retrieval strategies on golden_retrieval (hard) + golden_rag questions. Retrieval only (+LLM rewrites for multi_query).
  uv run python -m evals.compare_retrieval  → evals/results/retrieval_compare.json"""
import json, statistics, time
from app.retrieve import search
from evals.metrics import retrieval_metrics
from evals.rag_eval import RESULTS, load

K = 3
CONFIGS = [("dense", "bge"), ("bm25", "bge"), ("hybrid", "bge"), ("hybrid_rerank", "minilm"), ("hybrid_rerank", "bge"), ("multi_query", "bge")]


def main():
    qs = [{"id": c["id"], "kind": c["kind"], "query": c["query"], "ref_docs": c["ref_docs"]} for c in load("golden_retrieval.jsonl")]
    qs += [{"id": c["id"], "kind": "rag_question", "query": c["question"], "ref_docs": c["ref_docs"]} for c in load() if c["ref_docs"]]
    search("warmup", k=1, mode="hybrid_rerank", reranker="minilm"); search("warmup", k=1, mode="hybrid_rerank")
    table, per_query = [], {}
    for mode, rr in CONFIGS:
        name = mode if mode != "hybrid_rerank" else f"hybrid_rerank_{rr}"
        rows, lat = [], []
        for q in qs:
            t = time.perf_counter()
            ids = [h["doc_id"] for h in search(q["query"], k=K, mode=mode, reranker=rr)]
            lat.append((time.perf_counter() - t) * 1000)
            m = retrieval_metrics(ids, q["ref_docs"])
            rows.append(m | {"kind": q["kind"]})
            per_query.setdefault(q["id"], {"query": q["query"], "kind": q["kind"], "ref": q["ref_docs"]})[name] = ids
        agg = {m: round(statistics.mean(r[m] for r in rows), 3) for m in ("hit", "mrr", "ctx_precision", "ctx_recall")}
        kinds = {}
        for r in rows:
            kinds.setdefault(r["kind"], []).append(r["hit"])
        table.append({"method": name, **agg, "latency_ms": round(statistics.mean(lat)), "hit_by_kind": {k: round(sum(v) / len(v), 2) for k, v in kinds.items()}})
        print(f"{name:22} hit@{K}={agg['hit']:.3f} mrr={agg['mrr']:.3f} recall={agg['ctx_recall']:.3f} prec={agg['ctx_precision']:.3f} "
              f"{round(statistics.mean(lat)):5}ms  {table[-1]['hit_by_kind']}")
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "retrieval_compare.json").write_text(json.dumps({"k": K, "n_queries": len(qs), "table": table, "per_query": per_query}, indent=2))


if __name__ == "__main__":
    main()
