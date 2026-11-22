"use client";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { BookOpen, Check, ChevronDown, ExternalLink, Play } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";

type Module = {
  n: number; tone: string; title: string;
  metric: [string, string];                 // [value, what it measures]
  basics: string; how: string; odyssey: string; tradeoff: string;
  tryIt: { label: string; href: string };
  check: { q: string; a: string };
  links: [string, string][];
};

const q = (page: string, query: string) => `${page}?q=${encodeURIComponent(query)}`;

const MODULES: Module[] = [
  { n: 1, tone: "assistant", title: "RAG Engineering", metric: ["38 chunks", "13 mission docs, dense + BM25 vectors"],
    basics: "An LLM only knows its training data. RAG finds relevant passages at query time and puts them in the prompt, so the model answers from evidence and cites it.",
    how: "Docs → chunk by heading (800 chars, 100 overlap) → each chunk gets a header \"ODY-03 · Kepler-Vex · mission_log · 2241-01-08 | title > heading\" → 384-d embeddings → Qdrant. Query → nearest chunks → prompt with [doc_id] tags → structured {answer, citations, answerable}.",
    odyssey: "\"Who commands ODY-03?\" answered Okafor-Reyes (stale roster). The Sol 46 log that says Varga took over was indexed but never retrieved: its title says \"Meridian\", never \"ODY-03\". Putting front-matter metadata in every chunk header fixed it.",
    tradeoff: "Small chunks = precise but split facts. Big chunks = context but blurry embeddings. Metadata headers help ID-style queries but can crowd out untagged docs (the history timeline lost a slot).",
    tryIt: { label: "Ask the Assistant", href: q("/assistant", "Who currently commands ODY-03?") },
    check: { q: "The Sol 46 log was in the index. Why did retrieval still miss it?",
      a: "No chunk of it contained the string \"ODY-03\": BM25 had no term to match and the embedding had no signal tying \"Meridian\" to the ID. Retrieval can only find what the chunk text says, so the fix was to put the metadata into the text." },
    links: [["RAG paper (Lewis et al.)", "https://arxiv.org/abs/2005.11401"], ["Chunking strategies", "https://www.pinecone.io/learn/chunking-strategies/"], ["Contextual retrieval", "https://www.anthropic.com/news/contextual-retrieval"]] },

  { n: 2, tone: "evals", title: "LLM Evaluation", metric: ["19/19", "RAG golden set pass rate (was 16/18)"],
    basics: "LLM output is open-ended and non-deterministic, so unit tests can't judge it. A golden dataset + metrics turns 'looks fine' into numbers you can compare across changes.",
    how: "Score each arrow separately: question→docs (hit@k, MRR, ctx precision/recall, code-based), docs→answer (groundedness), answer→question (relevance), answer→truth (correctness). LLM judges write an explanation before the verdict.",
    odyssey: "Judges caught what a human skims past: an E-217 answer missing the \"CO2 below 0.5%\" limit, and answers inventing causes (\"crushed\", \"alters the risk class\"). Two prompt rules took the set to 19/19. Judge calibrated 36/36 against a human check; RAGAS agrees within ~5 points.",
    tradeoff: "Judges are cheap and scalable but biased (self-preference, verbosity). 19 cases is small: prompt fixes tuned against them can overfit, so grow the set before trusting a few points.",
    tryIt: { label: "Open Evaluations", href: "/evals" },
    check: { q: "Generation runs on Groq. Why is the judge DeepSeek?",
      a: "A different model family reduces self-preference bias (models rate their own style higher), and it keeps judge calls off Groq's free-tier rate limit during eval runs." },
    links: [["Your AI product needs evals", "https://hamel.dev/blog/posts/evals/"], ["RAGAS metrics", "https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/"]] },

  { n: 3, tone: "investigate", title: "LangGraph + Agent Harness", metric: ["≤5 steps", "agent ⇄ tools loop cap per investigation"],
    basics: "A harness is the runtime around a model: loop, tools, context, permissions, limits. LangGraph makes that runtime an explicit graph instead of an opaque while-loop.",
    how: "Typed state flows through nodes; reducers append evidence/trace across the agent⇄tools cycle; conditional edges route; interrupt() checkpoints state and waits for a human; Command(resume=…) continues the same thread_id.",
    odyssey: "ANM-0042: classify → search_docs → get_mission → check_approval_policy → assess → ⏸ Director → recommend. Locally it resumes from a different process. On Vercel the checkpoint lives in one instance's /tmp, so a resume landing elsewhere loses the thread.",
    tradeoff: "More structure = more reliable and testable, less 'creative' autonomy. Cap steps; return tool errors as messages so the agent can recover.",
    tryIt: { label: "Run an investigation", href: q("/investigate", "Investigate anomaly ANM-0042 and recommend next steps") },
    check: { q: "What makes a resume work after the original request is gone?",
      a: "interrupt() saves the full graph state to a checkpointer keyed by thread_id. Command(resume=decision) on the same thread_id reloads it and continues from the paused node. It only works if the resume can reach that store, hence Postgres for multi-instance deploys." },
    links: [["LangGraph overview", "https://docs.langchain.com/oss/python/langgraph/overview"], ["Interrupts", "https://docs.langchain.com/oss/python/langgraph/interrupts"], ["Building effective agents", "https://www.anthropic.com/engineering/building-effective-agents"]] },

  { n: 4, tone: "retrieval", title: "Advanced RAG", metric: ["0.953", "hit@3 over 43 queries (hybrid + MiniLM rerank)"],
    basics: "Dense vectors capture meaning but blur exact strings (codes, IDs, numbers). BM25 matches exact terms but misses paraphrases. Use both, then rerank.",
    how: "Dense + BM25 candidates fused with Reciprocal Rank Fusion (Σ 1/(60+rank), ranks only) → cross-encoder re-reads each (query, chunk) pair → top-k. Optional LLM query rewrites (multi-query).",
    odyssey: "\"LS-CART-B\": BM25 ranks the manual first, dense doesn't. On mission-ID queries MiniLM reaches 0.75 and bge 1.00, but bge costs ~8 s per query on CPU, so MiniLM stays the default.",
    tradeoff: "Reranking buys precision with latency (0.7 s MiniLM vs ~8 s bge on CPU). Multi-query adds an LLM call per search and didn't beat rerank here.",
    tryIt: { label: "Compare in Retrieval Lab", href: q("/retrieval", "LS-CART-B") },
    check: { q: "Why fuse with RRF instead of averaging the scores?",
      a: "Cosine similarity, BM25 weights and cross-encoder logits live on different scales; averaging them is meaningless without fragile normalisation. RRF uses only ranks, so it needs none." },
    links: [["Qdrant hybrid queries", "https://qdrant.tech/documentation/concepts/hybrid-queries/"], ["Contextual retrieval", "https://www.anthropic.com/news/contextual-retrieval"]] },

  { n: 5, tone: "graph", title: "Agent Evaluation", metric: ["9/9", "agent scenarios incl. fault recovery + injection"],
    basics: "A right answer reached the wrong way is a latent bug. Agent evals score the trajectory: route, tools, order, pauses, recovery, safety.",
    how: "Scenarios declare expected route, required tools (subset / in-order match), must-interrupt, injected faults and safety constraints. Scores come from the recorded trace. A pytest gate fails CI below thresholds.",
    odyssey: "Includes a search tool that fails 3× (the agent must still finish) and an indirect prompt injection in a relay log. After today's RAG changes the agent eval re-ran 8/8 (the 9th needs --adversarial).",
    tradeoff: "Exact trajectory matching is brittle for LLM agents; subset matching + outcome checks is more robust but can miss wasteful detours, hence the efficiency score.",
    tryIt: { label: "See the trajectory table", href: "/evals" },
    check: { q: "Why match required tools as a subset, not the exact sequence?",
      a: "Agents legitimately vary: an extra lookup or a different order can still be correct. Exact matching fails good runs and trains you to ignore red builds. Check what must happen (and in-order only where order matters), and score efficiency separately." },
    links: [["Demystifying evals for AI agents", "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents"]] },

  { n: 6, tone: "telemetry", title: "Guardrails + AI Safety", metric: ["0.004", "Prompt Guard score on the planted injection (missed)"],
    basics: "Defence in depth: check input, treat retrieved documents as untrusted data, limit tool permissions, verify output. No single filter is enough.",
    how: "Regex rules + Llama Prompt Guard 2 on input; quarantine instruction-like chunks; approval is NOT a tool (only the human interrupt approves); every citation must be a retrieved doc_id (normalised first).",
    odyssey: "Prompt Guard scored the relay-log injection 0.004; the rule layer caught it. The citation check once flagged a correct citation as hallucinated because the model echoed the whole \"[MAN-RD440] (type=…)\" header. It now reduces citations to the bare doc_id.",
    tradeoff: "Every guard adds latency and false positives (a correct citation flagged is a false positive). Deterministic checks first, LLM classifiers second.",
    tryIt: { label: "Try the poisoned relay", href: q("/investigate", "Investigate the latest relay transmission about ODY-05 and what it means for the radiation waiver.") },
    check: { q: "Why is approval an interrupt, not a tool the agent can call?",
      a: "Anything exposed as a tool can be called by the model, including when injected text tells it to. An interrupt sits outside the model's control: only a human resuming the thread can approve." },
    links: [["OWASP Top 10 for LLM apps", "https://genai.owasp.org/llm-top-10/"], ["Prompt injection (Simon Willison)", "https://simonwillison.net/tags/prompt-injection/"]] },

  { n: 7, tone: "mission", title: "Integration + Production", metric: ["~20 s / <1 s", "Vercel cold start / warm request"],
    basics: "Production = the same AI core plus API, streaming, failure handling, observability, cost control, CI and a deploy.",
    how: "FastAPI + SSE streams graph events. One Vercel project: Next.js at /, FastAPI at /api. The bundle is read-only, so each process downloads models to /tmp and builds an in-memory index on cold start. GitHub Actions runs pytest + lint/build on every push and live evals on PRs.",
    odyssey: "Two deploy bugs: the model download wrote its cache outside /tmp (crash), and a sibling process read a half-built on-disk index (7/38 chunks). Earlier: Groq's 8k TPM limit, a silent fallback mislabelling an experiment, embedded Qdrant's single-process lock.",
    tradeoff: "Serverless = zero ops, but no persistent disk: telemetry and checkpoints reset per instance. Fallbacks keep you up but change behaviour, so record which model actually answered.",
    tryIt: { label: "Open Telemetry", href: "/telemetry" },
    check: { q: "Production served 7 of 38 chunks. What happened?",
      a: "Several Python processes share one instance's /tmp. One was still writing the on-disk index when another saw the collection, skipped ingest and loaded the partial snapshot. Fix: each process builds its own in-memory index, so nothing is shared." },
    links: [["FastAPI", "https://fastapi.tiangolo.com/"], ["Vercel Services", "https://vercel.com/docs/services"], ["Vercel function limits", "https://vercel.com/docs/functions/limitations"]] },
];

// The path one request takes, mapped to the module that explains each stage.
const PIPELINE: [string, number][] = [["Guard input", 6], ["Route", 3], ["Retrieve", 4], ["Generate", 1], ["Verify citations", 6], ["Evaluate", 2], ["Ship", 7]];
const STORE = "odyssey-learn-done";

// Per-viewer progress in localStorage, read via useSyncExternalStore (SSR-safe). Storage can be blocked
// (private mode), so an in-memory copy keeps the checkboxes working for the session anyway.
let memory = "[]";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const readDone = () => { try { return localStorage.getItem(STORE) ?? memory; } catch { return memory; } };
const writeDone = (v: string) => { memory = v; try { localStorage.setItem(STORE, v); } catch {} listeners.forEach((f) => f()); };

export default function Learn() {
  const [open, setOpen] = useState<number | null>(1);
  const [reveal, setReveal] = useState<Set<number>>(new Set());
  const doneRaw = useSyncExternalStore(subscribe, readDone, () => "[]");
  const done = useMemo(() => { try { return new Set<number>(JSON.parse(doneRaw)); } catch { return new Set<number>(); } }, [doneRaw]);
  const toggle = (set: Set<number>, n: number) => { const s = new Set(set); if (s.has(n)) s.delete(n); else s.add(n); return s; };
  const markDone = (n: number) => writeDone(JSON.stringify([...toggle(done, n)]));
  const go = (n: number) => { setOpen(n); document.getElementById(`m${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div data-tone="learn">
      <PageHeader tone="learn" icon={BookOpen} eyebrow="AI Engineering Lab" title="How Odyssey works" />
      <p className="reveal -mt-4 mb-6 max-w-3xl text-text/80">Seven modules, each read the same way: <b className="text-heading">basics</b> → <b className="text-heading">how it works</b> → <b className="text-heading">what happened in Odyssey</b> → the trade-off. Then try it live and answer the check question before you tick it off.</p>

      <Card className="reveal mb-6">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">One request, end to end</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {PIPELINE.map(([stage, n], i) => (
            <span key={stage} className="flex items-center gap-1.5">
              <button onClick={() => go(n)} className="rounded-md border border-line px-2.5 py-1 text-xs text-text/90 transition-colors hover:border-white/30 hover:text-heading">
                {stage} <span className="font-mono text-muted">M{n}</span>
              </button>
              {i < PIPELINE.length - 1 && <span className="text-muted">→</span>}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={done.size} aria-valuemin={0} aria-valuemax={MODULES.length} aria-label="Modules you can explain">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(done.size / MODULES.length) * 100}%`, background: "var(--bright-learn)" }} />
          </div>
          <span className="font-mono text-xs text-muted">{done.size}/{MODULES.length} can explain</span>
        </div>
      </Card>

      <div className="space-y-4">
        {MODULES.map((m, i) => (
          <Card key={m.n} tone={m.tone} strip className="reveal !p-0 scroll-mt-6" style={{ animationDelay: `${i * 50}ms` }}>
            <div id={`m${m.n}`} />
            <button onClick={() => setOpen(open === m.n ? null : m.n)} className="flex w-full items-center gap-4 p-5 text-left lg:p-6" aria-expanded={open === m.n}>
              <span className="chip-icon grid h-11 w-11 shrink-0 place-items-center rounded-tl-xl rounded-br-xl font-display text-lg font-bold">
                {done.has(m.n) ? <Check size={18} /> : m.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-semibold text-heading">{m.title}</span>
                <span className="line-clamp-1 text-sm text-muted">{m.basics}</span>
              </span>
              <span className="hidden text-right sm:block">
                <span className="block font-display text-lg font-semibold" style={{ color: "var(--c)" }}>{m.metric[0]}</span>
                <span className="block max-w-[14rem] text-[11px] leading-tight text-muted">{m.metric[1]}</span>
              </span>
              <ChevronDown size={18} className={`shrink-0 text-muted transition-transform duration-200 ${open === m.n ? "rotate-180" : ""}`} />
            </button>

            {open === m.n && (
              <div className="reveal grid gap-5 border-t border-line p-5 lg:grid-cols-2 lg:p-6">
                <p className="text-sm sm:hidden"><b style={{ color: "var(--c)" }}>{m.metric[0]}</b> <span className="text-muted">{m.metric[1]}</span></p>
                {[["Basics", m.basics], ["How it works", m.how], ["In Odyssey", m.odyssey], ["Trade-off", m.tradeoff]].map(([h, t]) => (
                  <div key={h}><p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--c)" }}>{h}</p><p className="text-sm leading-relaxed text-text/90">{t}</p></div>
                ))}

                <div className="rounded-lg border border-line bg-white/[0.02] p-4 lg:col-span-2">
                  <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--c)" }}>Check yourself</p>
                  <p className="text-sm font-medium text-heading">{m.check.q}</p>
                  {reveal.has(m.n)
                    ? <p className="reveal mt-2 text-sm leading-relaxed text-text/90">{m.check.a}</p>
                    : <button onClick={() => setReveal((r) => toggle(r, m.n))} className="mt-2 text-xs text-muted underline-offset-2 hover:text-heading hover:underline">Answer it in your head, then reveal</button>}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:col-span-2">
                  <Link href={m.tryIt.href} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-black" style={{ background: "var(--c)" }}>
                    <Play size={12} /> {m.tryIt.label}
                  </Link>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text/90">
                    <input type="checkbox" checked={done.has(m.n)} onChange={() => markDone(m.n)} className="accent-current" style={{ color: "var(--c)" }} />
                    I can explain this
                  </label>
                  <span className="flex flex-wrap gap-3 sm:ml-auto">
                    {m.links.map(([t, u]) => <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-heading hover:underline">{t}<ExternalLink size={11} /></a>)}
                  </span>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted"><Badge kind="muted">Tip</Badge> Every number here comes from a saved eval run in <span className="font-mono">backend/evals/results/</span>.</p>
    </div>
  );
}
