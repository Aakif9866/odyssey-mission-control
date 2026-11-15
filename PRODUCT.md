# Odyssey: Product Overview

**An AI assistant over an organisation's internal documents that can also investigate problems and recommend actions, with a human approving risky decisions.**

The space theme is packaging. Underneath, it's the most common enterprise AI system being built today.

## The fictional world
The **Helios Exploration Directorate (HED)** runs space missions. Its knowledge lives in documents: planet profiles, mission briefs, crew rosters, daily logs, science reports, equipment manuals, history.
Like real company data, it's messy: outdated versions (drill manual v1 vs v2), contradictions (roster vs later log), look-alike docs (two "6-hour seismic" reports on different planets), exact codes (E-217, V-11).

## Users and what Odyssey does for them
| User | Asks | Odyssey does |
|---|---|---|
| Station engineer | "Error E-217 in Hab B, what do I do?" | Finds the manual section, gives the exact procedure + citation |
| Mission scientist | "Investigate anomaly ANM-0042" | Gathers evidence across reports/logs, weighs hypotheses, recommends next steps |
| Mission planner | "Is ODY-05 ready to launch?" | Checks brief + open issues: "No, radiation waiver pending" |
| Director (human) | — | Receives approval requests before risky actions; approves/rejects |
| AI engineer | "Is it good? Did my change break it?" | Eval scores, traces, cost per request, regression tests |

## What gets built
1. **Knowledge assistant**: cited answers, says "I don't know" when the docs don't cover it
2. **Retrieval engine**: dense + BM25 hybrid, fusion, reranking, metadata filters
3. **Investigation agent**: LangGraph workflow with tools + human approval (see `WORKFLOW.md`)
4. **Guardrails**: input/retrieval/tool/output checks; resists a poisoned document
5. **Evaluation suite**: golden dataset, retrieval + answer + agent-trajectory metrics, LangSmith experiments, regression gate
6. **Observability**: per-request trace, latency, tokens, cost
7. **Mission Control UI**: the product (Next.js)
8. **AI Engineering Lab**: separate learning site explaining all of the above with live playgrounds

## Mapping to real client work
| Odyssey | Real client equivalent |
|---|---|
| Equipment manuals + error codes | Airline/factory maintenance assistant ("fault P0420 procedure?") |
| Investigate ANM-0042 | IT incident investigation: logs + runbooks → root cause → fix |
| Drill manual v1 vs v2 | Policy/SOP versioning in banks, pharma, insurance |
| Director approval | Approval workflows: refunds, credit decisions, prod changes |
| Poisoned relay log | Prompt injection via emails, tickets, uploaded PDFs |
| Eval suite + regression gate | Client's first ask: "prove it's accurate and stays accurate" |
| Cost/latency tracking | "What does 1,000 queries cost?" (every project review) |

## What's missing vs a real production project (deliberately)
| Missing | Real-world version | Why skipped / how hard to add |
|---|---|---|
| Messy input parsing | PDFs, scans, tables, OCR (Docling, Unstructured), SharePoint/Confluence/Drive connectors | Parsing work, not AI concepts. Swap the loader; rest of pipeline unchanged |
| Scale | Millions of chunks, Qdrant cluster, sharding, async ingestion queue, embedding batch jobs | Same code; infra change. Discussed in M7 |
| Access control | Per-user/team document permissions | Easy: a metadata filter on every query |
| Auth, multi-tenancy | Login, per-client data isolation | Out of scope by brief |
| Deployment | Docker, cloud, autoscaling, secrets manager | Out of scope today |
| Real domain experts | SMEs write/verify golden set, label judge outputs | Claude plays SME, verified against docs |
| Online feedback loop | Thumbs up/down → new eval cases → retraining prompts | Designed in M7, not fully built |
| Long conversation memory | Multi-turn chat with summarised history | Single-turn + thread checkpoints only |
| Model hosting | Self-hosted models (vLLM), GPU cost planning | API providers only |

**Bottom line:** the AI engineering core is production-shaped; only the surrounding plumbing is simplified.
