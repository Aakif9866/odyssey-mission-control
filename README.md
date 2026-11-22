# odyssey-mission-control

AI space mission-control platform: RAG over mission documents, hybrid retrieval + reranking, a LangGraph investigation agent with human-in-the-loop approval, layered guardrails, and RAG + agent-trajectory evals. Built during a 6-hour AI engineering sprint.

Product overview: [PRODUCT.md](PRODUCT.md) · Workflow and graph state: [WORKFLOW.md](WORKFLOW.md) · Progress: [CHECKLIST.md](CHECKLIST.md)

**Live:** https://odyssey-mission-control-one.vercel.app

## Deploy (Vercel)
One Vercel project, two services (`vercel.json`): Next.js UI at `/`, FastAPI at `/api/*` (prefix stripped).
`npx vercel deploy --prod` from the repo root; `.vercelignore` uploads only `frontend/`, `backend/`, `data/corpus/`.
- The bundle is read-only, so each Python process downloads the ONNX models to `/tmp` and builds an in-memory
  Qdrant index on cold start (~20 s cold, <1 s warm).
- Env vars: `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `GEN_*`, `JUDGE_*` (set in the Vercel project, never in the UI).
- Limits: run telemetry and agent checkpoints live in per-instance `/tmp` SQLite, so they reset on cold start, and a
  resume that lands on another instance loses its thread. A Postgres checkpointer fixes this.

## CI
`.github/workflows/ci.yml`: pytest (incl. regression gate on committed eval results) + frontend lint/build on every push.
`.github/workflows/evals.yml`: live RAG + agent evals on PRs touching `backend/app`, `backend/evals` or `data/corpus`
(needs `GROQ_API_KEY` / `DEEPSEEK_API_KEY` repo secrets), gated by the same thresholds.

## Run it
```bash
cp .env.example .env                                     # GROQ_API_KEY, DEEPSEEK_API_KEY
docker run -d --name odyssey-qdrant -p 6333:6333 qdrant/qdrant:v1.20.0
cd backend && uv sync
uv run python -m app.ingest --reset                      # 13 docs → 38 chunks (dense + BM25)
uv run uvicorn app.api:app --port 8000                   # API
cd ../frontend && npm install && npm run dev             # UI on http://localhost:3000
```
No Docker? Remove `QDRANT_URL` from `.env` and Qdrant runs embedded (single process only).

## Architecture
```
Next.js UI (Mission Control · Assistant · Investigations · Documents · Retrieval Lab · Evals · Graph · Telemetry · Learn)
      │  REST + SSE (graph events stream live)
FastAPI ── /ask /search /investigate(/stream, /resume) /documents /ingest /evals /graph /runs /metrics
      │
LangGraph: guard_input → classify ─┬─ question ──→ rag_answer ───────────────┐
                                   ├─ investigation → agent ⇄ tools (≤5 steps)  │
                                   │        → assess → needs approval? ─ ⏸ human_approval (interrupt, SQLite checkpoint)
                                   │                          └──────→ recommend ─┤
                                   └─ out_of_scope / blocked → refuse             └→ guard_output
      │
Retrieval: dense (bge-small) + BM25 (sparse, IDF) → RRF fusion in Qdrant → cross-encoder rerank (MiniLM)
LLMs: Groq gpt-oss-120b (generation, agent) · gpt-oss-20b (routing, rewrites) · Llama Prompt Guard 2 (injection)
      DeepSeek deepseek-flash (eval judge + fallback provider)
```

## Results (real runs, `backend/evals/results/`)
| What | Result |
|---|---|
| RAG baseline (dense, k=5) | 16/18 pass · correctness 0.94 · groundedness 0.94 · hit@5 1.0 |
| RAG hybrid + rerank | 16/18 pass · ctx recall 0.97 → **1.0**; remaining failures are generation, not retrieval |
| RAG v2 (metadata chunk headers + tighter prompt, 19 cases) | **19/19 pass** · correctness 1.0 · groundedness 1.0 (was 16/18; fixed E-217 omitted safety limit, embellished reasons, "who commands ODY-03?" answered with stale roster) |
| Generator comparison | gpt-oss-120b 88.9% · gpt-oss-20b 77.8% (half the cost) · deepseek-flash 77.8% |
| Retrieval benchmark (39 queries, k=3) | dense 0.90 → bm25 0.92 → hybrid 0.95 → +MiniLM 0.97 (688 ms) → +bge 1.00 (6.4 s) |
| Retrieval, + 4 mission-ID queries (43, k=3) | hybrid+MiniLM hit@3 0.907 → **0.953** with metadata in chunk headers; mission-ID queries 0.25 → 0.75 (bge: 1.00) |
| RAGAS cross-check | faithfulness 0.95 vs ours 0.94 · ctx recall 0.94 vs 0.97 |
| Judge calibration | 36/36 verdicts agree with a human check |
| Agent eval (9 scenarios) | **9/9**: route 1.0 · tools 1.0 · approval pause 1.0 · fault recovery 1.0 · safety (direct + indirect injection) 1.0 |

## Lessons we hit for real
- Groq free tier = 8k tokens/min → rate-limit-aware retries (wait; never silently switch models in an eval).
- A silent provider fallback mislabelled an experiment → evals disable fallback and record `models_used`.
- DeepSeek has JSON mode but no strict schema → validate with Pydantic and retry on truncation.
- Groq validates tool-call args server-side → nullable optional params + resample on rejection.
- Prompt Guard missed the planted indirect injection (0.004); the rule layer caught it → defence in depth.
- The router (gpt-oss-20b) sent 'error E-217' to out_of_scope → explicit scope + examples in the routing prompt.
- The scorer failed a correct answer: the model wrote `LS‑CART‑B` with U+2011 hyphens → normalise text before string checks.
- Citations echoed the whole context header (`[MAN-RD440] (type=…)`) → flagged as hallucinated; normalise to bare doc_id in the one shared check.
- "Who commands ODY-03?" missed the log that says so: its title says "Meridian", never "ODY-03" → embed front-matter (mission · planet · type · date) in every chunk header.
- Judges caught the generator adding unstated causes ("crushed", "alters risk class") → prompt: stay close to source wording.
- Embedded Qdrant locks to one process → server mode for API + evals side by side.

## Tests
```bash
cd backend && uv run pytest -q            # metrics, trajectory scorer, RRF, guards + regression gate on saved evals
uv run python -m evals.rag_eval --tag <name> [--mode hybrid_rerank] [--model ...]
uv run python -m evals.compare_retrieval
uv run python -m evals.agent_eval --adversarial
uv run evals/ragas_check.py baseline      # isolated env (PEP 723)
```
