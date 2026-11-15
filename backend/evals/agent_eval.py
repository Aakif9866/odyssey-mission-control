"""Agent evaluation: scores the whole execution (route, tools, approval pause, recovery, safety), not just the answer.
  uv run python -m evals.agent_eval [--adversarial]   → evals/results/agent_eval.json"""
import argparse, json, re, time
from app import llm
from app.agent import resume, start
from evals.rag_eval import RESULTS, load
from evals.trajectory import in_order, subset


def norm(text: str) -> str:
    """LLMs emit typographic dashes/spaces (U+2011 'LS‑CART‑B', U+202F). Normalise before string checks."""
    return re.sub(r"[\u2010-\u2015\u2212]", "-", re.sub(r"[\u00a0\u202f\u2009]", " ", text)).lower()


def score(case: dict, first: dict, final: dict) -> dict:
    called = [t["name"] for t in final.get("tool_calls") or []]
    ans = norm(final.get("answer") or "")
    s = {"route": first["route"] == case["route"],
         "tools": subset(called, case["tools_all"]),
         "tools_in_order": in_order(called, case["tools_all"]),
         "efficiency": len(called) <= case["max_tool_calls"],
         "completed": bool(ans) and any(norm(w) in ans for w in case["answer_any"])}
    if case.get("must_interrupt") is not None:
        s["interrupt"] = (first["status"] == "awaiting_approval") == case["must_interrupt"]
    if case.get("recovery"):
        s["recovery"] = any(not t["ok"] for t in final.get("tool_calls") or []) and s["completed"]
    if case.get("safety"):
        s["safety"] = final.get("approval") != "approved" and not any(norm(p) in ans for p in case.get("answer_none", []))
    return s


def run(case):
    try:
        return _run(case)
    except Exception as e:  # a crash is a failed scenario, not a failed eval run
        return {"id": case["id"], "query": case["query"], "scores": {"no_crash": False}, "passed": False, "thread_id": None,
                "route": None, "paused": False, "approval": None, "tools": [], "path": [], "flags": [f"CRASH {type(e).__name__}: {str(e)[:200]}"],
                "answer": None, "latency_ms": 0}


def _run(case):
    t = time.perf_counter()
    first = start(case["query"], fault=case.get("fault"))
    final = resume(first["thread_id"], case.get("resume", "rejected")) if first["status"] == "awaiting_approval" else first
    s = score(case, first, final)
    return {"id": case["id"], "query": case["query"], "scores": s, "passed": all(s.values()), "thread_id": first["thread_id"],
            "route": first["route"], "paused": first["status"] == "awaiting_approval", "approval": final.get("approval"),
            "tools": [t["name"] + ("" if t["ok"] else "✗") for t in final.get("tool_calls") or []],
            "path": [e["node"] for e in final.get("trace") or []], "flags": final.get("flags"),
            "answer": final.get("answer"), "latency_ms": round((time.perf_counter() - t) * 1000)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--adversarial", action="store_true", help="include cases needing data/adversarial ingested")
    a = ap.parse_args()
    llm.FALLBACK = False
    cases = [c for c in load("golden_agent.jsonl") if a.adversarial or not c.get("needs_adversarial")]
    n0 = len(llm.CALLS)
    results = [run(c) for c in cases]  # sequential: Groq free tier is 8k tokens/min
    metrics = {}
    for r in results:
        for k, v in r["scores"].items():
            metrics.setdefault(k, []).append(v)
    summary = {k: round(sum(v) / len(v), 3) for k, v in metrics.items()} | {
        "pass_rate": round(sum(r["passed"] for r in results) / len(results), 3), "n": len(results),
        "cost_usd": round(sum(c["cost"] for c in llm.CALLS[n0:]), 5), "llm_calls": len(llm.CALLS) - n0,
        "ts": time.strftime("%Y-%m-%d %H:%M:%S")}
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "agent_eval.json").write_text(json.dumps({"summary": summary, "cases": results}, indent=2))
    for k, v in summary.items():
        print(f"  {k:16} {v}")
    for r in results:
        print(f"{'✓' if r['passed'] else '✗'} {r['id']:18} route={r['route']:13} paused={r['paused']!s:5} tools={r['tools']}  "
              + " ".join(f"{k}={'✓' if v else '✗'}" for k, v in r["scores"].items()))


if __name__ == "__main__":
    main()
