"""RAG evaluation pipeline.
  uv run python -m evals.rag_eval --tag baseline                 # dense, k=5, gpt-oss-120b
  uv run python -m evals.rag_eval --tag llama8b --model llama-3.1-8b-instant
  uv run python -m evals.rag_eval --tag hybrid_rerank --mode hybrid_rerank
Writes evals/results/<tag>.json (config, summary, per-case details)."""
import argparse, json, statistics, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from app.config import GEN
from app import llm
from app.llm import CALLS
from app.rag import answer, build_context
from evals.judges import judge
from evals.metrics import concise, retrieval_metrics

HERE = Path(__file__).parent
RESULTS = HERE / "results"


def load(name="golden_rag.jsonl"):
    return [json.loads(l) for l in (HERE / name).read_text().splitlines() if l.strip()]


def run_case(case, k, mode, model):
    t = time.perf_counter()
    r = answer(case["question"], k=k, mode=mode, model=model)
    ms = round((time.perf_counter() - t) * 1000)
    unanswerable = not case["ref_docs"]
    ctx = build_context(r["chunks"])
    ids = [c["doc_id"] for c in r["chunks"]]
    out = {"id": case["id"], "category": case["category"], "question": case["question"], "reference": case["reference"],
           "answer": r["answer"], "citations": r["citations"], "answerable": r["answerable"], "retrieved": ids,
           "bad_citations": r["bad_citations"], "latency_ms": ms, "llm": r["llm"],
           "contexts": [c["text"] for c in r["chunks"]]}
    out["retrieval"] = None if unanswerable else retrieval_metrics(ids, case["ref_docs"])
    v = {}
    if unanswerable:  # correctness = did it refuse? (code check, no judge needed)
        v["correctness"] = {"passed": not r["answerable"], "explanation": "expects answerable=false"}
    else:
        v["correctness"] = judge("correctness", question=case["question"], answer=r["answer"], reference=case["reference"]).model_dump()
        v["retrieval_relevance"] = judge("retrieval_relevance", question=case["question"], context=ctx).model_dump()
    v["relevance"] = judge("relevance", question=case["question"], answer=r["answer"]).model_dump()
    v["groundedness"] = judge("groundedness", answer=r["answer"], context=ctx).model_dump()
    v["concision"] = {"passed": concise(r["answer"], case["reference"]), "explanation": f"{len(r['answer'])} vs ref {len(case['reference'])} chars"}
    out["verdicts"] = v
    out["passed"] = all(x["passed"] for m, x in v.items() if m in ("correctness", "groundedness"))
    return out


def summarize(cases):
    def rate(metric):
        xs = [c["verdicts"][metric]["passed"] for c in cases if metric in c["verdicts"]]
        return round(sum(xs) / len(xs), 3) if xs else None
    ret = [c["retrieval"] for c in cases if c["retrieval"]]
    lat = sorted(c["latency_ms"] for c in cases)
    s = {m: rate(m) for m in ("correctness", "relevance", "groundedness", "retrieval_relevance", "concision")}
    s |= {f"{m}": round(statistics.mean(r[m] for r in ret), 3) for m in ("hit", "mrr", "ctx_precision", "ctx_recall")}
    s |= {"pass_rate": round(sum(c["passed"] for c in cases) / len(cases), 3),
          "latency_p50_ms": lat[len(lat) // 2], "latency_p95_ms": lat[min(len(lat) - 1, int(len(lat) * 0.95))],
          "gen_tokens": sum(c["llm"]["in"] + c["llm"]["out"] for c in cases),
          "gen_cost_usd": round(sum(c["llm"]["cost"] for c in cases), 5)}
    cats = {}
    for c in cases:
        cats.setdefault(c["category"], []).append(c["passed"])
    s["by_category"] = {k: f"{sum(v)}/{len(v)}" for k, v in cats.items()}
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="baseline")
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--mode", default="dense")
    ap.add_argument("--model", default=None)
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    llm.FALLBACK = False
    cases = load()
    n0 = len(CALLS)
    with ThreadPoolExecutor(a.workers) as ex:
        results = list(ex.map(lambda c: run_case(c, a.k, a.mode, a.model), cases))
    judge_calls = [c for c in CALLS[n0:] if c["role"] == "judge" and c["tag"].startswith("judge")]
    summary = summarize(results) | {"judge_cost_usd": round(sum(c["cost"] for c in judge_calls), 5)}
    used = sorted({c["llm"]["model"] for c in results})
    config = {"models_used": used, "tag": a.tag, "k": a.k, "mode": a.mode, "model": a.model or GEN["model"], "judge": "deepseek-flash",
              "n_cases": len(cases), "ts": time.strftime("%Y-%m-%d %H:%M:%S")}
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / f"{a.tag}.json").write_text(json.dumps({"config": config, "summary": summary, "cases": results}, indent=2))
    print(json.dumps(config))
    for k, v in summary.items():
        print(f"  {k:22} {v}")
    print("\nFAILED:")
    for c in results:
        if not c["passed"]:
            bad = [m for m, x in c["verdicts"].items() if not x["passed"]]
            print(f"  {c['id']:18} {c['category']:13} failed={bad}  retrieved={c['retrieved']}")


if __name__ == "__main__":
    main()
