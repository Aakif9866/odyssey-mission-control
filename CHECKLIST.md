# Odyssey Sprint Checklist

Tick `[x]` as we go. Each module = **Learn → Build → Verify**. Don't skip Verify.
Stretch items get cut first if we fall behind (M7 UI before anything in M5/M6).

Claude builds everything; you run, inspect output, and note key ideas.

## Timeline (Sun 2026-11-15)
| Time | Block | Started | Done |
|---|---|---|---|
| 13:30–14:30 | M1 RAG Engineering | | |
| 14:30–15:25 | M2 LLM Evaluation | | |
| 15:25–15:35 | Break | | |
| 15:35–16:35 | M3 LangGraph + Agent Harness | | |
| 16:35–17:25 | M4 Advanced RAG | | |
| 17:25–18:15 | M5 Agent Evaluation | | |
| 18:15–18:45 | M6 Guardrails + AI Safety | | |
| 18:45–19:45 | M7 Integration + Production | | |
| 19:45–20:00 | Wrap-up: CONCEPTS.md self-test (+ buffer) | | |

Later (not today): AI Engineering Lab website, built on Odyssey's `/traces` + `/evals` API.

---

## M0 Setup (done before the session)
- [x] git repo, uv backend (Python 3.12), deps installed and importing
- [x] fastembed models pre-downloaded (dense, BM25, bge-reranker-v2-m3, MiniLM, ColBERT)
- [x] All deps on latest versions; RAGAS isolated (it would downgrade openai/langchain)
- [x] Fictional corpus written (`data/corpus/`, 13 docs)
- [x] `cp .env.example .env` and add `GROQ_API_KEY`, `DEEPSEEK_API_KEY`
- [x] `cd backend && uv run python check_env.py` → both providers answer

---

## M1 RAG Engineering (60 min)
**Learn**
- [x] Why RAG exists (knowledge cutoff, private data, grounding, citations)
- [x] Pipeline: load → chunk → embed → index → retrieve → build context → prompt → generate → cite
- [x] Chunking: fixed vs recursive vs by-heading; overlap; chunk size trade-off
- [x] Embeddings: what a vector encodes, cosine similarity, why 384-d
- [x] Vector DB internals: HNSW (approximate NN), payloads, metadata filters
- [x] Failure modes: wrong chunk, split fact, stale doc, distractor, "lost in the middle"
- [x] Document updates: re-ingest by `doc_id`, versioning (v1 vs v2 drill manual)

**Build**
- [x] `app/config.py` + `app/llm.py` (OpenAI-compatible client, logs latency + tokens)
- [x] `app/ingest.py`: parse front matter → chunks with metadata → Qdrant
- [x] chunking function (by heading + size limit + overlap)
- [x] `app/rag.py`: retrieve top-k → context with `[doc_id]` tags → grounded answer + citations
- [x] "I don't know" behaviour when context lacks the answer

**Verify**
- [x] Ask: "What should the crew do on error E-217?" → cites MAN-HABLS
- [x] Ask: "Max drilling depth for the RD-440?" → inspect: did v1 or v2 win? Why?
- [x] Ask something not in the corpus → refuses to invent
- [x] Print retrieved chunks + scores for 1 query and read them

Resources: [RAG paper (Lewis et al.)](https://arxiv.org/abs/2005.11401) · [Pinecone: chunking strategies](https://www.pinecone.io/learn/chunking-strategies/) · [fastembed docs](https://qdrant.github.io/fastembed/)

---

## M2 LLM Evaluation (60 min)
**Learn**
- [x] Why unit tests aren't enough (non-determinism, open-ended outputs, plausible ≠ correct)
- [x] Golden dataset: question, reference answer, reference contexts (doc_ids)
- [x] Reference-based vs reference-free metrics
- [x] Retrieval metrics: context precision, context recall (plus hit-rate / MRR by doc_id)
- [x] Generation metrics: faithfulness, answer relevancy, correctness
- [x] LLM-as-judge: how it works, biases (self-preference, verbosity, position), why a different judge model

**Build**
- [x] `evals/golden_rag.jsonl` with ~15 Qs (easy, multi-hop, version trap, contradiction, distractor, unanswerable)
- [x] retrieval eval (no LLM): hit@k, MRR from doc_ids
- [x] Own LLM-judge metrics (faithfulness, relevancy, correctness) with Pydantic structured output → `evals/results/rag_baseline.json`
- [x] Cross-check with RAGAS (isolated: `uv run evals/ragas_check.py`); do our scores agree?
- [x] Failure analysis: list the failed cases + root cause (retrieval vs generation)
- [x] 4 judges: correctness, relevance, groundedness, retrieval relevance (explanation-before-verdict); see `notes/krish-naik-rag-eval.md`
- [x] Code-based evaluator (concision) alongside LLM judges
- [ ] Optional: LangSmith dataset + experiments (only if `LANGSMITH_API_KEY` set)
- [x] Model comparison experiment: `gpt-oss-120b` vs `llama-3.1-8b-instant` on the same dataset
- [x] Judge calibration: hand-check ~10 judge verdicts → agreement %

**Verify**
- [x] Baseline (gpt-oss-120b, dense k=5): correctness 0.944 · groundedness 0.944 · relevance 1.0 · ctx precision 0.921 · ctx recall 0.969 · hit@5 1.0 · MRR 0.953 · pass 16/18. RAGAS: faithfulness 0.948, ctx precision 0.867, ctx recall 0.938
- [x] Explain one failure: was it retrieval or generation?
- [x] Change one thing: generator model → 120b 88.9% / 20b 77.8% / deepseek 77.8% pass

Resources: [Hamel: Your AI product needs evals](https://hamel.dev/blog/posts/evals/) · [RAGAS metrics](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/) · [Eugene Yan: LLM patterns](https://eugeneyan.com/writing/llm-patterns/)

---

## M3 LangGraph + Agent Harness (60 min)
**Learn**
- [x] What an agent harness is: the runtime around the model (loop, tools, context, memory, permissions, limits). Claude Code / Codex are harnesses; our graph is Odyssey's
- [x] Context engineering: what goes into the window each step (system prompt, tool results, retrieved evidence, trimmed history)
- [x] Why graphs: explicit control flow vs a free-running agent loop
- [x] State (TypedDict + reducers), nodes, edges, conditional edges, cycles
- [x] Tool calling: model emits a tool call → ToolNode executes → loop
- [x] Checkpointing: thread_id, resume, time travel
- [x] Interrupts / human-in-the-loop: `interrupt()` + `Command(resume=...)`
- [x] Retries + error handling; subgraphs (concept)

**Build**
- [x] Tools: `search_docs`, `get_mission(id)`, `get_crew(mission)`, `request_director_approval(...)`
- [x] Investigation graph: classify → retrieve/tools loop → assess evidence → (needs approval? → interrupt) → recommend
- [x] Checkpointer; record node-level events (node, input, output, ms) as a trace list
- [x] Retry policy on the LLM node

**Verify**
- [x] "Investigate ANM-0042 and recommend next steps" → runs, cites evidence, **pauses for approval**
- [x] Resume with approve / reject → different endings
- [x] Print the trace: nodes visited + tool calls in order

Resources: [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview) · [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) · [Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) · [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

---

## M4 Advanced RAG (60 min)
**Learn**
- [x] Dense vs sparse; BM25 formula intuition (TF saturation, IDF, length norm)
- [x] Where dense fails: exact codes/IDs, rare terms. Where BM25 fails: paraphrase
- [x] Hybrid search + Reciprocal Rank Fusion
- [x] Cross-encoder reranking: bi-encoder vs cross-encoder trade-off
- [x] Query rewriting, multi-query, metadata filtering

**Build**
- [x] Add sparse vectors to Qdrant collection; hybrid query with RRF
- [x] Rerank top-20 → top-5 (bge-reranker-v2-m3 vs old MiniLM: accuracy vs latency)
- [ ] Stretch: ColBERT late interaction via Qdrant multivectors
- [x] Query rewrite / multi-query (one, not both, if short on time)
- [x] `evals/compare_retrieval.py`: dense vs BM25 vs hybrid vs hybrid+rerank on the golden set (hit@k, MRR, latency)

**Verify**
- [x] Comparison table saved to `evals/results/retrieval_compare.json` and pasted here
- [x] E-217 / V-11 style queries: BM25/hybrid beat dense?
- [x] ANM-0042 vs Cinder distractor: does reranking fix it?
- [x] Re-run RAGAS on the best pipeline vs M2 baseline

Resources: [Qdrant hybrid queries](https://qdrant.tech/documentation/concepts/hybrid-queries/) · [RRF paper](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) · [Anthropic: Contextual retrieval](https://www.anthropic.com/news/contextual-retrieval) · [SBERT retrieve & rerank](https://sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html)

---

## M5 Agent Evaluation (60 min)
**Learn**
- [x] Final-answer eval vs trajectory eval (the path matters)
- [x] Tool-call accuracy (right tool, right args), routing accuracy
- [x] Task completion, failure recovery (inject tool errors), step efficiency
- [x] Regression testing: fixed scenarios, thresholds, run on every change

**Build**
- [x] `evals/golden_agent.jsonl`: scenario, expected route, expected tools (ordered/unordered), must-interrupt?, answer check
- [x] trajectory scorer from recorded traces (exact, subset, in-order match)
- [x] Fault injection: tool raises / times out → agent recovers?
- [x] `tests/test_agent_regression.py`: pytest fails if scores drop below threshold

**Verify**
- [x] Scores: tool accuracy 1.0 · routing 1.0 (after router-prompt fix; was 0.889) · completion 1.0 · recovery 1.0 · 9/9 pass
- [x] One scenario where the final answer was right but the trajectory was wrong
- [x] `uv run pytest` green

Resources: [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [LangSmith docs](https://docs.smith.langchain.com/)

---

## M6 Guardrails + AI Safety (30 min)
**Learn**
- [x] Guardrail layers: input → retrieval → tool → output (defence in depth, no single filter)
- [x] Prompt injection: direct vs **indirect** (malicious text inside retrieved docs), and why RAG + tools makes it dangerous
- [x] Deterministic checks first (schemas, allowlists, regex, limits), LLM classifiers second
- [x] Least privilege for tools: which tools are read-only, which need human approval
- [x] Output checks: groundedness/citation verification, PII/secret leakage, refusal for out-of-scope

**Build**
- [x] Input guard: scope + injection classifier (structured output) before the graph
- [x] Retrieval guard: wrap retrieved text as untrusted data; flag instruction-like content
- [x] tool guard: `request_director_approval` can only be triggered by the human interrupt, never by model text alone
- [x] Output guard: every claim cites a retrieved `doc_id`; uncited answer → block or downgrade
- [x] Ingest `data/adversarial/log-relay-contaminated.md` and attack the agent

**Verify**
- [x] Injection doc retrieved → agent does NOT approve the waiver, flags the source as unverified
- [x] Add 3 adversarial cases to `golden_agent.jsonl` (they become regression tests)
- [x] Guardrail cost: ~200 ms per request (Prompt Guard call); regex + citation checks ~0 ms

Resources: [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/) · [Simon Willison: prompt injection](https://simonwillison.net/tags/prompt-injection/)

---

## M7 Integration + Production (60 min)
**Learn**
- [x] End-to-end architecture diagram (frontend → FastAPI → graph → retriever/tools → LLM)
- [x] Observability: traces, spans, latency p50/p95, tokens, cost per request
- [x] Provider failures: timeouts, retries with backoff, fallback model (Groq → DeepSeek)
- [x] Scaling: async, concurrency, ingestion queue, Qdrant server/sharding, caching
- [x] CI evals: regression gates; online monitoring + user feedback loop

**Build**
- [x] FastAPI: `/ask`, `/investigate`, `/investigate/{thread}/resume`, `/ingest`, `/traces`, `/evals`
- [x] Fallback model + timeout in `app/llm.py`
- [x] Next.js mission-control UI: assistant chat + evidence/citations, investigation view with trace timeline + approve/reject, eval results page
- [ ] Optional: LangSmith tracing via env vars

**Verify**
- [x] Full flow in the browser: ask → cited answer; investigate → approve → recommendation
- [x] Trace view shows real node timings + tokens
- [x] Kill the Groq key → fallback works (401 → served by deepseek-flash, tagged `:fallback`)
- [x] Final README architecture section written

Resources: [FastAPI](https://fastapi.tiangolo.com/) · [Groq tool use](https://console.groq.com/docs/tool-use) · [DeepSeek API](https://api-docs.deepseek.com/)

---

## Day 2 Replication Challenge (90 min, no Claude, docs allowed)
In an empty folder, using `data/corpus/`:
- [ ] Ingest + chunk + embed into Qdrant; answer 3 questions with citations
- [ ] Golden set of 5 Qs; hit@k + one LLM-judge metric
- [ ] 3-node LangGraph: route → retrieve/tool → answer, with one `interrupt()`
- [ ] Hybrid search with your own RRF
- [ ] Note where you got stuck → those are the topics to revisit

Spaced review: CONCEPTS.md on Day 3 and Day 7 (15 min each).

---

## Parking lot (ideas for after today)
-
