"""Feedback loop: export thumbs-down answers from the app DB into an eval set.
  uv run python -m evals.pull_feedback            → appends new cases to evals/golden_feedback.jsonl
  uv run python -m evals.rag_eval --set feedback --tag feedback --mode hybrid_rerank
Cases have reference=null: scored with reference-free judges (relevance, groundedness) until a human writes the
reference and ref_docs, then they can move into golden_rag.jsonl. Text was PII-redacted when the feedback was stored."""
import json
from app import db
from evals.rag_eval import HERE

OUT = HERE / "golden_feedback.jsonl"


def main():
    have = {json.loads(l)["id"] for l in OUT.read_text().splitlines() if l.strip()} if OUT.exists() else set()
    rows = db.q("select id, ts, ref_id, question, answer, comment from feedback where rating='down' order by ts")
    new = [{"id": f"fb_{fid}", "category": "feedback", "question": q, "reference": None, "ref_docs": None, "needs_review": True,
            "bad_answer": a, "comment": c, "ref_id": ref} for fid, ts, ref, q, a, c in rows if f"fb_{fid}" not in have]
    with OUT.open("a") as f:
        for c in new:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    print(f"{len(new)} new thumbs-down cases → {OUT.name} ({len(have) + len(new)} total)")


if __name__ == "__main__":
    main()
