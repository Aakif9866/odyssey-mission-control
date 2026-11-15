# odyssey-mission-control

AI space mission-control platform: RAG over mission documents, hybrid retrieval + reranking, LangGraph investigation agents with human-in-the-loop approval, and RAGAS/trajectory evals. Built during a 6-hour AI engineering sprint.

## Quickstart
```bash
cp .env.example .env              # add GROQ_API_KEY and DEEPSEEK_API_KEY
cd backend && uv sync
uv run python check_env.py        # both providers should answer
```

## Stack
FastAPI · LangGraph · Qdrant (embedded) · fastembed (dense + BM25 + cross-encoder) · RAGAS · Groq (generation) · DeepSeek (judge) · Next.js (UI)

## Layout
- `data/corpus/`: fictional mission documents (ground truth for evals)
- `backend/`: Python API, RAG pipeline, agent graph, evals
- `frontend/`: mission-control UI
- `CHECKLIST.md` / `CONCEPTS.md`: sprint progress + self-test

Architecture section: written in Module 6.
