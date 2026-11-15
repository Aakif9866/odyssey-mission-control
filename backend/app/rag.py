"""Grounded answering.  Run: uv run python -m app.rag "your question" """
import sys
from pydantic import BaseModel, Field
from app.llm import CALLS, chat
from app.retrieve import search

SYSTEM = """You are ODYSSEY, mission-control assistant of the Helios Exploration Directorate.
Answer ONLY from the provided context. Every factual claim must cite a doc_id from the context.
If documents conflict, prefer the most recent date / current version and say so.
If the context does not contain the answer, set answerable=false and say you don't know."""


class Answer(BaseModel):
    answer: str
    citations: list[str] = Field(description="doc_ids actually used")
    answerable: bool


def build_context(chunks: list[dict]) -> str:
    return "\n\n".join(
        f"[{c['doc_id']}] (type={c['type']}, date={c.get('date')}, version={c.get('version', '-')}, status={c.get('status', '-')})\n{c['text']}"
        for c in chunks)


def answer(question: str, k: int = 5, mode: str = "dense", model: str | None = None, **filters) -> dict:
    chunks = search(question, k, mode=mode, **filters)
    # Stable system prompt first, variable context last → provider prompt caching works.
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Context:\n{build_context(chunks)}\n\nQuestion: {question}"}]
    a = chat(msgs, schema=Answer, model=model, tag="rag_answer")
    retrieved = {c["doc_id"] for c in chunks}
    return {"answer": a.answer, "citations": a.citations, "answerable": a.answerable,
            "bad_citations": [d for d in a.citations if d not in retrieved],  # cited but never retrieved = hallucinated source
            "chunks": chunks, "llm": CALLS[-1]}


if __name__ == "__main__":
    r = answer(" ".join(sys.argv[1:]) or "What should the crew do on error E-217?")
    print("RETRIEVED:")
    for c in r["chunks"]:
        print(f"  {c['score']:.3f}  {c['doc_id']:<13} {c['heading'][:50]}")
    print(f"\nANSWER: {r['answer']}\nCITATIONS: {r['citations']}  answerable={r['answerable']}  bad_citations={r['bad_citations']}")
    print(f"LLM: {r['llm']}")
