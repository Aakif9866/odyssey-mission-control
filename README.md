# Odyssey Mission Control

[![CI](https://github.com/Aakif9866/odyssey-mission-control/actions/workflows/ci.yml/badge.svg)](https://github.com/Aakif9866/odyssey-mission-control/actions/workflows/ci.yml)

**Live demo:** https://odyssey-mission-control-one.vercel.app

An AI assistant over an organisation's internal documents. It answers with citations, investigates problems by calling tools, and pauses for a human before any risky action. Every claim it makes is measured by evals that run in CI.

The space theme is packaging: the fictional Helios Exploration Directorate's 13 mission documents are as messy as real company data, with superseded manual versions, a roster contradicted by a later log, look-alike reports and exact error codes. Each mess is a deliberate test case. More in [PRODUCT.md](PRODUCT.md).

## Highlights
- **RAG that cites and knows when to say "I don't know":** 19/19 on the golden set (correctness 1.0, groundedness 1.0), up from 16/18.
- **Hybrid retrieval:** dense + BM25 → Reciprocal Rank Fusion → cross-encoder rerank. hit@3 0.953 over 43 queries, including exact codes and look-alike distractors.
- **LangGraph investigation agent:** tools, a 5-step cap, and a human-approval `interrupt()` with checkpointed resume. 9/9 trajectory scenarios, including tool-failure recovery and an indirect prompt injection.
- **Layered guardrails:** rules + Llama Prompt Guard 2 on input, quarantine of instruction-like documents, approval kept outside the model's reach, citation verification. The rule layer caught an injection Prompt Guard scored 0.004.
- **Eval-driven:** own LLM judges (different model family, calibrated 36/36 against a human check), RAGAS cross-check, retrieval benchmarks, regression gates in CI.
- **Shipped:** FastAPI + SSE streaming, Next.js mission-control UI, one-project Vercel deploy, GitHub Actions.

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
Retrieval: chunks with metadata headers → dense (bge-small) + BM25 → RRF in Qdrant → cross-encoder rerank (MiniLM)
LLMs:      Groq gpt-oss-120b (generation, agent) · gpt-oss-20b (routing, rewrites) · Llama Prompt Guard 2 (injection)
           DeepSeek deepseek-flash (eval judge + fallback provider)
```
Graph state and node-by-node behaviour: [WORKFLOW.md](WORKFLOW.md).

| Layer | Choice | Why |
|---|---|---|
| Generation / agent | Groq `gpt-oss-120b` via the `openai` SDK | Fast, cheap, good tool calling; no LangChain, one OpenAI-compatible code path |
| Judge | DeepSeek `deepseek-flash` | Different model family = less self-preference bias |
| Embeddings / BM25 / rerank | fastembed (local ONNX) | No embeddings API on Groq/DeepSeek; no torch |
| Vector DB | Qdrant (Docker locally, in-memory on Vercel) | Native hybrid queries with RRF |
| Agent | LangGraph 1.x | Explicit graph, typed state, interrupts, checkpoints |
| UI | Next.js 16, Tailwind v4, recharts | Mission-control dashboard + engineering lab |

## Results
All from real runs saved in [`backend/evals/results/`](backend/evals/results/).

| What | Result |
|---|---|
| RAG baseline (dense, k=5, 18 cases) | 16/18 pass · correctness 0.94 · groundedness 0.94 · hit@5 1.0 |
| RAG hybrid + rerank | 16/18 · ctx recall 0.97 → 1.0; remaining failures were generation, not retrieval |
| **RAG v2** (metadata chunk headers + grounding prompt rules, 19 cases) | **19/19** · correctness 1.0 · groundedness 1.0 |
| Retrieval benchmark (39 queries, k=3) | dense 0.90 → BM25 0.92 → hybrid 0.95 → +MiniLM 0.97 (688 ms) → +bge 1.00 (6.4 s) |
| Retrieval + 4 mission-ID queries (43, k=3) | hybrid + MiniLM 0.907 → **0.953** with metadata headers; mission-ID queries 0.25 → 0.75 (bge 1.00) |
| Generator comparison | gpt-oss-120b 88.9% · gpt-oss-20b 77.8% (half the cost) · deepseek-flash 77.8% |
| RAGAS cross-check | faithfulness 0.95 vs ours 0.94 · ctx recall 0.94 vs 0.97 |
| Judge calibration | 36/36 verdicts agree with a human check |
| Agent eval | 9/9 incl. adversarial: route, tools, approval pause, fault recovery, safety all 1.0 (re-ran 8/8 non-adversarial after RAG v2) |

Caveat: 19 RAG cases is a small set, and the v2 prompt rules were tuned against it. Growing the golden set is the next step before trusting small deltas.

## Lessons we hit for real
**Retrieval**
- "Who commands ODY-03?" returned the stale roster: the log saying command changed was titled "Meridian", never "ODY-03", so nothing matched. Front-matter metadata (mission · planet · type · date) now goes into every chunk header.
- Metadata headers have a cost: the untagged history timeline lost a top-5 slot on one multi-hop question.

**Generation and evals**
- Judges caught the generator adding unstated causes ("crushed", "alters the risk class") and dropping a safety limit (CO2 < 0.5%). Two prompt rules fixed both.
- The citation check flagged a correct citation as hallucinated because the model echoed the whole context header (`[MAN-RD440] (type=…)`). It now normalises to the bare doc_id in the one shared check.
- A silent provider fallback mislabelled an experiment, so evals disable fallback and record `models_used`.
- A scorer failed a correct answer written with U+2011 hyphens (`LS‑CART‑B`), so text is normalised before string checks.

**Agents and safety**
- Prompt Guard missed the planted indirect injection (score 0.004); the rule layer caught it. That's why the guardrails are layered.
- The router sent "error E-217" to out_of_scope, so the routing prompt now spells out scope with examples.
- Groq validates tool-call args server-side, so optional params are nullable and rejected calls are resampled.

**Production**
- Groq free tier = 8k tokens/min, so retries wait as told and never silently switch models.
- DeepSeek has JSON mode but no strict schema: validate with Pydantic, retry on truncation.
- Vercel: the Hugging Face cache wrote outside `/tmp` (read-only crash), and a sibling process read a half-built on-disk index (7/38 chunks). Each process now builds its own in-memory index.

## Run locally
```bash
cp .env.example .env                                     # GROQ_API_KEY, DEEPSEEK_API_KEY
docker run -d --name odyssey-qdrant -p 6333:6333 qdrant/qdrant:v1.20.0
cd backend && uv sync
uv run python -m app.ingest --reset                      # 13 docs → 38 chunks (dense + BM25)
uv run uvicorn app.api:app --port 8000                   # API
cd ../frontend && npm install && npm run dev             # UI on http://localhost:3000
```
No Docker? Remove `QDRANT_URL` from `.env` and Qdrant runs embedded (single process only).
API on another port? Start the UI with `NEXT_PUBLIC_API=http://localhost:<port> npm run dev`.

## Tests and evals
```bash
cd backend && uv run pytest -q            # metrics, trajectory scorer, RRF, chunking, guards + regression gate
uv run python -m evals.rag_eval --tag <name> --mode hybrid_rerank [--model ...]
uv run python -m evals.compare_retrieval  # 6 retrieval configs × 43 queries
uv run python -m evals.agent_eval [--adversarial]
uv run evals/ragas_check.py baseline      # isolated env (PEP 723), never imports app/
```

## CI
- [`ci.yml`](.github/workflows/ci.yml), every push: pytest (including the regression gate on committed eval results) + frontend lint and build.
- [`evals.yml`](.github/workflows/evals.yml), PRs touching `backend/app`, `backend/evals` or `data/corpus`: ingest, run live RAG + agent evals, fail below thresholds, upload results. Needs `GROQ_API_KEY` and `DEEPSEEK_API_KEY` repo secrets.

## Deploy (Vercel)
One project, two services ([`vercel.json`](vercel.json)): Next.js at `/`, FastAPI at `/api/*` (prefix stripped). Deploy with `npx vercel deploy --prod` from the repo root; [`.vercelignore`](.vercelignore) uploads only `frontend/`, `backend/` and `data/corpus/`.
- The bundle is read-only, so each Python process downloads the ONNX models to `/tmp` and builds an in-memory index on cold start (~20 s cold, <1 s warm).
- Keys live in the Vercel project's env vars and never reach the browser.

## Project layout
```
data/corpus/       13 fictional mission docs (YAML front matter = metadata), the eval ground truth
data/adversarial/  poisoned relay log for injection tests (kept out of the main corpus)
backend/app/       config, llm client, chunking, ingest, retrieve, rag, graph, tools, guards, api
backend/evals/     golden sets (jsonl), judges, metrics, runners, results/
backend/tests/     pytest, including the CI regression gate
frontend/          Next.js mission-control UI + Learn section
```

## Known limits and next steps
- **Serverless state:** on Vercel, telemetry and agent checkpoints live in per-instance `/tmp` SQLite. They reset on cold start, and a resume landing on another instance loses its thread. Next: a Postgres checkpointer.
- **Public API:** the live API spends the project's LLM quota. Next: a Vercel Firewall rate limit on `/api/*`.
- **Eval set size:** grow the golden sets to ~200 cases with confidence intervals.
- **Cold start:** bundle the models instead of downloading them per process.

Built during a 6-hour AI engineering sprint; progress in [CHECKLIST.md](CHECKLIST.md), self-test in [CONCEPTS.md](CONCEPTS.md).
