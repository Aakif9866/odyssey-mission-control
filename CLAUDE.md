# CLAUDE.md: Odyssey AI Engineering Sprint

A 6-hour hands-on AI engineering crash course, taught **in this Claude chat**, built around one project:
**Odyssey, an AI space mission-control app**. The full original brief is in `info.txt`, and where this file differs from it, this file wins.

## Roles
- **Claude = teacher + coding agent.** Teach one topic at a time, then implement it in Odyssey, then make the user run and inspect it.
- **The user** already knows Python, APIs, full-stack, and basic LLM ideas. Don't teach from scratch, don't repeat material.

## Scope decisions (made 2026-11-15)
- **The AI Engineering Lab website is cut** for today. Learning happens in chat, so a second Next.js app is ~2h of zero learning value.
  Its useful parts (trace viewer, eval results, retrieval comparison) live inside Odyssey's UI in Module 6.
  Revisit only if the user explicitly asks.
- **Modules (7):** M1 RAG · M2 LLM Eval · M3 LangGraph + Agent Harness · M4 Advanced RAG · M5 Agent Eval · M6 Guardrails + AI Safety · M7 Integration + Production. The timeline is in `CHECKLIST.md`.
- **Lab website = after today**, built on Odyssey's `/traces` + `/evals` API. Not in parallel.
- **Odyssey backend first**, with the frontend last (M7). Every module ends with something runnable from the CLI/pytest.
- No auth, payments, or SaaS features. No Docker needed (Qdrant runs embedded).

## Teaching loop (per topic)
1. **Concept** in ≤10 lines: what it is, why it exists, the data flow (ASCII diagram if helpful).
2. **Internals**: how it actually works under the hood, and the key trade-off.
3. **Build**: Claude writes the code in small diffs; walk through the *important* 10–20 lines, not all of it.
4. **Run**: the user runs it and looks at real output (scores, chunks, traces). Break something on purpose when instructive.
5. **Check**: ask 1–2 sharp questions; the user answers before moving on. Tick `CHECKLIST.md`.
6. **Resources**: 1–3 links from `CHECKLIST.md` (all verified). **Never invent links or timestamps.** Verify any new link with curl before giving it.

Keep explanations short and technical. Show observable execution, never hidden chain-of-thought.
Track time: if a module runs >15 min over, cut the stretch items, never the Verify step.

## Stack
| Layer | Choice | Why |
|---|---|---|
| LLM (generation, agent) | Groq `openai/gpt-oss-120b` (fallback `llama-3.1-8b-instant`) | Fast, cheap, good tool calling |
| LLM (judge for evals) | DeepSeek `deepseek-flash` | Different model family = less self-preference bias; no Groq rate limits during RAGAS |
| Client | `openai` SDK / `langchain-openai` with `base_url` | Both providers are OpenAI-compatible: one code path |
| Embeddings | fastembed `BAAI/bge-small-en-v1.5` (384-d, local) | Groq/DeepSeek have no embeddings API |
| Sparse/BM25 | fastembed `Qdrant/bm25` | Native Qdrant sparse vectors, hybrid via RRF |
| Reranker | fastembed `BAAI/bge-reranker-v2-m3-int8` (2024); `Xenova/ms-marco-MiniLM-L-6-v2` as the fast/old baseline to compare | Local ONNX, no torch |
| Late interaction (M4 stretch) | fastembed `answerdotai/answerai-colbert-small-v1` + Qdrant multivectors | ColBERT-style token-level matching |
| Vector DB | Qdrant embedded (`QdrantClient(path="backend/.qdrant")`), Query API (`prefetch` + `FusionQuery(RRF)`) | Zero infra; same API as server mode |
| Agent | LangGraph 1.x (`StateGraph`, `ToolNode`, `interrupt()`/`Command`, `InMemorySaver`) | |
| Evals | Own LLM-judge metrics (Pydantic structured outputs) + RAGAS 0.4 cross-check + pytest regression gates | |

Pinned at setup (all latest on 2026-11-15): langgraph 1.2.22, langchain-core/openai 1.8.0, openai 3.51.0, fastapi 0.163.0, qdrant-client 1.20.0, fastembed 0.9.1, pydantic 2.14.

**RAGAS is NOT in the main env.** ragas 0.4.4 → instructor caps `openai<3.51` and drags in langchain 0.2. Keep it isolated:
`evals/ragas_check.py` uses PEP 723 inline metadata (`# /// script` with `dependencies = ["ragas>=0.4.4", ...]`) and runs with `uv run evals/ragas_check.py`.
It reads the answers/contexts JSON our own eval runner writes; it never imports `app/`.

## Modern practices to use (not extra modules, just how we build)
- Structured outputs (Pydantic schemas) for answers + citations, judge verdicts, and routing decisions. No regex parsing of LLM text.
- Async FastAPI + streaming (SSE) of tokens and graph events (`graph.astream(..., stream_mode=["updates","messages"])`).
- Native tool calling via the OpenAI-compatible `tools` param; LangGraph `ToolNode`.
- Eval-driven development: golden set first, every change measured against it, results saved as JSON.
- Prompt caching awareness: stable system prompt prefix first, variable context last (DeepSeek bills cache hits ~50× cheaper).
- Observability: per-call latency/tokens/cost from day one; optional LangSmith (env vars) in M6.
| API | FastAPI + Pydantic | |
| Frontend (M6) | Next.js + TS + Tailwind + shadcn/ui | Mission-control UI |

Models are pre-downloaded to `backend/.models`, so always pass `cache_dir=".models"` (from `backend/`) to fastembed.

## Layout
```
data/corpus/        13 fictional mission docs (YAML front matter = metadata). Ground truth for evals. Don't edit casually.
backend/            uv project (Python 3.12). Run everything from here with `uv run ...`
  app/              config, llm client, ingest, retrieve, rag, graph, tools, api   (created as modules progress)
  evals/            golden datasets (jsonl), eval runners, results/ (json, committed)
  tests/            pytest
frontend/           Next.js (Module 6)
CHECKLIST.md        session tracker: tick boxes as we go
CONCEPTS.md         "can I explain it?" self-test, done at the end of each module
```

## Corpus facts worth knowing (designed traps)
- `manual-rd440-drill-v1.md` (superseded, 40 m) vs `v2` (current, 25 m in ice < -130 °C): **document update / versioning** test.
- Roster says commander = Okafor-Reyes; Sol 46 log says command moved to Varga: **temporal contradiction** test.
- ANM-0042 (Kepler-Vex, 0.37 Hz, ~6 h) vs Cinder seismic (1.2 Hz, ~6 h): **semantic distractor**, needs metadata filter / reranking.
- Exact codes (E-217, V-11, LS-CART-B, CB-9X, HED-OPS-7): **BM25 beats dense** test.
- ODY-03 launched after ODY-04: numbering trap for multi-hop questions.
- Director approval rules: hook for **human-in-the-loop interrupts**.
- `data/adversarial/log-relay-contaminated.md` contains an **indirect prompt injection** (tries to force waiver approval).
  Kept OUT of `data/corpus/` so M1–M5 baselines stay clean; ingested only in M6.

## Rules
- Always `uv` (never pip). `uv add <pkg>`, `uv run python ...`, `uv run pytest`.
- Keys only in `.env` (gitignored). Never send keys to the frontend; the frontend talks only to FastAPI.
- Mature libraries over hand-rolled code, *except* where hand-rolling once teaches the concept (e.g. cosine similarity, RRF in ~10 lines), then switch to the library.
- Small vertical slices; no scaffolding "for later". Eval results are real runs saved to `backend/evals/results/`.
- Log latency + token usage per LLM call from Module 1 onward (it feeds Module 6).
- Don't commit unless asked.
