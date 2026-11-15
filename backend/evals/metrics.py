"""Code-based retrieval metrics (no LLM): exact, free, deterministic."""


def retrieval_metrics(retrieved: list[str], relevant: list[str]) -> dict:
    """retrieved = doc_ids of ranked chunks; relevant = golden doc_ids."""
    rel = set(relevant)
    hits = [d in rel for d in retrieved]
    first = next((i for i, h in enumerate(hits) if h), None)
    # Context precision (rank-aware, RAGAS-style): mean of precision@i at each relevant position.
    precs = [sum(hits[:i + 1]) / (i + 1) for i, h in enumerate(hits) if h]
    return {"hit": first is not None,
            "mrr": 0.0 if first is None else 1 / (first + 1),
            "ctx_precision": sum(precs) / len(precs) if precs else 0.0,
            "ctx_recall": len(rel & set(retrieved)) / len(rel)}


def concise(answer: str, reference: str) -> bool:
    return len(answer) < 2 * len(reference) + 40


if __name__ == "__main__":
    m = retrieval_metrics(["A", "B", "A", "C"], ["A", "C"])
    assert m["hit"] and m["mrr"] == 1.0 and m["ctx_recall"] == 1.0
    assert abs(m["ctx_precision"] - (1 + 2 / 3 + 3 / 4) / 3) < 1e-9
    assert retrieval_metrics(["B"], ["A"]) == {"hit": False, "mrr": 0.0, "ctx_precision": 0.0, "ctx_recall": 0.0}
    print("metrics ok")
