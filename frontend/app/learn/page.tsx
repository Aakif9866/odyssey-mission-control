"use client";
import Link from "next/link";
import { useState } from "react";
import { BookOpen, ChevronDown, ExternalLink } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";

const MODULES = [
  { n: 1, tone: "assistant", title: "RAG Engineering", page: "/assistant",
    basics: "An LLM only knows its training data. RAG finds relevant passages at query time and puts them in the prompt, so the model answers from evidence and cites it.",
    how: "Docs → chunk by heading (800 chars, 100 overlap, title>heading prefix) → 384-d embeddings → Qdrant (HNSW index + metadata payload). Query → embed → nearest chunks → prompt with [doc_id] tags → structured {answer, citations, answerable}.",
    odyssey: "k=5 answered 'who commands Meridian?' correctly; k=3 dropped the Sol 46 log and confidently said the wrong commander. Retrieval caps quality.",
    tradeoff: "Small chunks = precise but split facts. Big chunks = context but blurry embeddings. Similarity scores are not confidence.",
    links: [["RAG paper (Lewis et al.)", "https://arxiv.org/abs/2005.11401"], ["Chunking strategies", "https://www.pinecone.io/learn/chunking-strategies/"]] },
  { n: 2, tone: "evals", title: "LLM Evaluation", page: "/evals",
    basics: "LLM output is open-ended and non-deterministic, so unit tests can't judge it. A golden dataset + metrics turns 'looks fine' into numbers you can compare.",
    how: "Score each arrow separately: question→docs (hit@k, MRR, ctx precision/recall, code-based), docs→answer (groundedness), answer→question (relevance), answer→truth (correctness). LLM judges give an explanation before the verdict.",
    odyssey: "Baseline 16/18. The judge caught a subtle hallucination: 'ODY-04 launched in 2239' when the docs only say it landed then. Judge calibrated 36/36 against a human check; RAGAS agrees within ~5 points.",
    tradeoff: "Judges are cheap and scalable but biased (self-preference, verbosity). Use a different model family and calibrate against humans.",
    links: [["Your AI product needs evals", "https://hamel.dev/blog/posts/evals/"], ["RAGAS metrics", "https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/"]] },
  { n: 3, tone: "investigate", title: "LangGraph + Agent Harness", page: "/investigate",
    basics: "A harness is the runtime around a model: loop, tools, context, permissions, limits. LangGraph makes that runtime an explicit graph instead of an opaque while-loop.",
    how: "Typed state flows through nodes; reducers append evidence/trace across the agent⇄tools cycle; conditional edges route; interrupt() checkpoints to SQLite and waits for a human; Command(resume=…) continues the same thread.",
    odyssey: "ANM-0042 investigation: classify → search_docs → get_mission → check_approval_policy → assess → ⏸ Director → recommend. Resumed from a different process.",
    tradeoff: "More structure = more reliable and testable, less 'creative' autonomy. Cap steps; return tool errors as messages so the agent can recover.",
    links: [["LangGraph overview", "https://docs.langchain.com/oss/python/langgraph/overview"], ["Interrupts", "https://docs.langchain.com/oss/python/langgraph/interrupts"], ["Building effective agents", "https://www.anthropic.com/engineering/building-effective-agents"]] },
  { n: 4, tone: "retrieval", title: "Advanced RAG", page: "/retrieval",
    basics: "Dense vectors capture meaning but blur exact strings (codes, IDs, numbers). BM25 matches exact terms but misses paraphrases. Use both.",
    how: "Dense + BM25 candidates fused with Reciprocal Rank Fusion (Σ 1/(60+rank), ranks only, no score normalisation) → cross-encoder reranker re-reads (query, chunk) pairs → top-k. Optional LLM query rewrites.",
    odyssey: "'LS-CART-B': BM25 ranks the manual first, dense doesn't. Benchmark on 39 queries in the Retrieval Lab.",
    tradeoff: "Reranking adds latency (CPU cross-encoder) for precision. Multi-query adds an LLM call per search.",
    links: [["Qdrant hybrid queries", "https://qdrant.tech/documentation/concepts/hybrid-queries/"], ["Contextual retrieval", "https://www.anthropic.com/news/contextual-retrieval"]] },
  { n: 5, tone: "graph", title: "Agent Evaluation", page: "/evals",
    basics: "A right answer reached the wrong way is a latent bug. Agent evals score the trajectory: route, tools, order, pauses, recovery.",
    how: "Scenarios declare expected route, required tools (subset/in-order match), must-interrupt, injected faults and safety constraints. Scores come from the recorded trace. A pytest gate fails CI below thresholds.",
    odyssey: "9 scenarios incl. tool-timeout recovery and indirect prompt injection. See the trajectory table on Evaluations.",
    tradeoff: "Exact trajectory matching is brittle for LLM agents; subset matching + outcome checks is more robust.",
    links: [["Demystifying evals for AI agents", "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents"]] },
  { n: 6, tone: "telemetry", title: "Guardrails + AI Safety", page: "/investigate",
    basics: "Defence in depth: check input, treat retrieved documents as untrusted data, limit tool permissions, verify output. No single filter is enough.",
    how: "Regex rules + Llama Prompt Guard 2 on input; quarantine instruction-like chunks; approval is NOT a tool (only the human interrupt approves); citations must be retrieved doc_ids.",
    odyssey: "Prompt Guard scored the planted relay-log injection 0.004 (missed it). The rule layer caught it. That's why layers exist.",
    tradeoff: "Every guard adds latency and false positives; deterministic checks first, LLM classifiers second.",
    links: [["OWASP Top 10 for LLM apps", "https://genai.owasp.org/llm-top-10/"], ["Prompt injection (Simon Willison)", "https://simonwillison.net/tags/prompt-injection/"]] },
  { n: 7, tone: "mission", title: "Integration + Production", page: "/telemetry",
    basics: "Production = the same AI core plus API, streaming, failure handling, observability and cost control.",
    how: "FastAPI + SSE streams graph events; per-call latency/tokens/cost; rate-limit-aware retries (wait, don't switch models); fallback provider on outages; evals as CI gates.",
    odyssey: "Hit real issues: Groq free tier 8k TPM, a silent fallback mislabelling an experiment, DeepSeek JSON-mode truncation, embedded Qdrant single-process lock.",
    tradeoff: "Fallbacks keep you up but change behaviour; record which model actually answered. Embedded DB is zero-infra but single-process.",
    links: [["FastAPI", "https://fastapi.tiangolo.com/"], ["Groq tool use", "https://console.groq.com/docs/tool-use"]] },
];

export default function Learn() {
  const [open, setOpen] = useState<number | null>(1);
  return (
    <div data-tone="learn">
      <PageHeader tone="learn" icon={BookOpen} eyebrow="AI Engineering Lab" title="How Odyssey works" />
      <p className="reveal -mt-4 mb-8 max-w-3xl text-text/80">Seven modules, each read the same way: <b className="text-heading">basics</b> → <b className="text-heading">how it works</b> → <b className="text-heading">what we saw in Odyssey</b> → the trade-off. Every module links to the live page that demonstrates it.</p>
      <div className="space-y-4">
        {MODULES.map((m, i) => (
          <Card key={m.n} tone={m.tone} strip className="reveal !p-0" style={{ animationDelay: `${i * 50}ms` }}>
            <button onClick={() => setOpen(open === m.n ? null : m.n)} className="flex w-full items-center gap-4 p-5 text-left lg:p-6" aria-expanded={open === m.n}>
              <span className="chip-icon grid h-11 w-11 shrink-0 place-items-center rounded-tl-xl rounded-br-xl font-display text-lg font-bold">{m.n}</span>
              <span className="flex-1"><span className="block font-display text-lg font-semibold text-heading">{m.title}</span><span className="line-clamp-1 text-sm text-muted">{m.basics}</span></span>
              <ChevronDown size={18} className={`text-muted transition-transform duration-200 ${open === m.n ? "rotate-180" : ""}`} />
            </button>
            {open === m.n && (
              <div className="reveal grid gap-5 border-t border-line p-5 lg:grid-cols-2 lg:p-6">
                {[["Basics", m.basics], ["How it works", m.how], ["In Odyssey", m.odyssey], ["Trade-off", m.tradeoff]].map(([h, t]) => (
                  <div key={h}><p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--c)" }}>{h}</p><p className="text-sm leading-relaxed text-text/90">{t}</p></div>
                ))}
                <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
                  <Link href={m.page}><Badge>Open live demo →</Badge></Link>
                  {m.links.map(([t, u]) => <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-heading hover:underline">{t}<ExternalLink size={11} /></a>)}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
