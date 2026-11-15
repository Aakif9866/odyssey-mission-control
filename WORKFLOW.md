# Odyssey: Workflow and Data Structures

Diagrams are Mermaid (render on GitHub and in VS Code's Markdown preview). The same diagrams are shown on the Lab site.

## 1. Who does what (tools vs roles)
| Stage | Tool | What it is |
|---|---|---|
| Chunking | **our code** (`app/chunking.py`) | Splits docs at headings into ~800-char pieces with overlap |
| Embedding | **fastembed** + `bge-small` | A *model runner*, not a DB. Turns text → 384 numbers (meaning) |
| Keyword vectors | **fastembed** + `Qdrant/bm25` | Turns text → sparse word-weight vector (exact terms) |
| Storage + search | **Qdrant** | The *vector database*: stores vectors + metadata, finds nearest neighbours fast (HNSW index), filters, fuses dense + keyword results |
| Reranking | **fastembed** + `bge-reranker-v2-m3` | Re-reads (question, chunk) pairs together and re-scores the top 20 |
| Generation | **Groq** `gpt-oss-120b` | Writes the cited answer / drives the agent |
| Orchestration | **LangGraph** | Runs the multi-step agent: state, routing, loops, pause/resume |
| Judging | **DeepSeek** `deepseek-flash` | Grades answers in evals |

## 2. Indexing (offline)
```mermaid
flowchart LR
  A[.md docs + front matter] --> B[parse metadata<br/>doc_id, planet, version, status]
  B --> C[chunk by heading<br/>800 chars, 100 overlap,<br/>title > heading prefix]
  C --> D[fastembed<br/>dense 384-d + BM25 sparse]
  D --> E[(Qdrant<br/>vectors + payload)]
```
Re-ingesting a file deletes its old chunks first → no stale versions.

## 3. Request flow (online), the LangGraph graph
```mermaid
flowchart TD
  S([user query]) --> G1[guard_input<br/>scope + injection check]
  G1 -->|blocked| R0[refuse]
  G1 --> C{classify}
  C -->|question| Q[rag_answer<br/>retrieve → cited answer]
  C -->|investigation| P[plan<br/>what evidence is needed]
  C -->|out_of_scope| R0
  P --> A[agent<br/>LLM decides next tool]
  A -->|tool call| T[tools<br/>search_docs · get_mission ·<br/>get_crew · check_approval_rules]
  T --> A
  A -->|enough evidence<br/>or step limit| AS[assess<br/>hypotheses, confidence, gaps]
  AS --> D{action needs<br/>Director approval?}
  D -->|yes| H[[⏸ human_approval<br/>interrupt]]
  H -->|approved / rejected| REC[recommend]
  D -->|no| REC
  Q --> G2[guard_output<br/>every claim cited?]
  REC --> G2
  G2 --> E([response + citations + trace])
  R0 --> E
```
- **Conditional edges**: `classify`, the agent ⇄ tools loop, `needs approval?`
- **Cycle**: agent ⇄ tools until enough evidence (capped at 6 steps)
- **Interrupt**: graph state is checkpointed; the run waits for a human, then resumes with the same `thread_id`
- **Retries**: LLM nodes retry with backoff; tool errors are returned to the agent as messages so it can recover

## 4. The graph state (the data structure every node reads/writes)
```python
class Evidence(TypedDict):
    doc_id: str; text: str; score: float; via: str      # via = "search_docs" | "get_mission" ...

class ToolCall(TypedDict):
    name: str; args: dict; ok: bool; ms: int

class Assessment(BaseModel):
    summary: str
    hypotheses: list[str]          # ranked
    confidence: Literal["low", "medium", "high"]
    gaps: list[str]                # what evidence is missing
    proposed_action: str
    needs_approval: bool
    approval_reason: str

class TraceEvent(TypedDict):
    node: str; ms: int; summary: str                     # observable events, no hidden reasoning

class OdysseyState(TypedDict):
    query: str
    route: Literal["question", "investigation", "out_of_scope", "blocked"]
    messages: Annotated[list, add_messages]              # LLM ⇄ tool conversation (reducer: append)
    evidence: Annotated[list[Evidence], operator.add]    # accumulates across loop iterations
    tool_calls: Annotated[list[ToolCall], operator.add]
    assessment: Assessment | None
    approval: Literal["pending", "approved", "rejected"] | None
    answer: str | None
    citations: list[str]
    steps: int                                           # loop guard
    trace: Annotated[list[TraceEvent], operator.add]     # feeds the visualizer + agent evals
```
**Reducers** (`Annotated[..., operator.add]`) tell LangGraph to *append* a node's output instead of overwriting, which is how evidence and the trace build up over the loop.

## 5. How state changes through one investigation
| Step | Node | State written |
|---|---|---|
| 1 | guard_input | `route` stays unset, trace += "input ok" |
| 2 | classify | `route = "investigation"` |
| 3 | plan | `messages += plan` |
| 4–7 | agent ⇄ tools | `tool_calls += …`, `evidence += …`, `steps += 1` |
| 8 | assess | `assessment = {hypotheses, needs_approval: true, …}` |
| 9 | human_approval | `approval = "pending"` → **paused**, checkpoint saved |
| 10 | (resume) | `approval = "approved"` |
| 11 | recommend | `answer`, `citations` |
| 12 | guard_output | verifies citations ⊆ evidence doc_ids |

## 6. Where evaluation hooks in
```mermaid
flowchart LR
  GD[(golden datasets)] --> RUN[run system on each case]
  RUN --> RET[retrieval metrics<br/>hit@k · MRR · ctx precision/recall]
  RUN --> GEN[answer metrics: LLM judge<br/>correctness · relevance · groundedness]
  RUN --> TRJ[agent metrics: from trace<br/>route · tool accuracy · approval · recovery]
  RET & GEN & TRJ --> REP[results JSON + LangSmith experiment]
  REP --> GATE{pytest gate<br/>below threshold?}
  GATE -->|yes| FAIL[block change]
```
