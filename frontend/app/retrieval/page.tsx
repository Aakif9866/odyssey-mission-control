"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Search } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api, post } from "@/lib/api";

const MODES = ["dense", "bm25", "hybrid", "hybrid_rerank"];
const MODE_TONE: Record<string, string> = { dense: "assistant", bm25: "retrieval", hybrid: "mission", hybrid_rerank: "evals", multi_query: "graph" };
const SAMPLES = ["LS-CART-B", "the carbon dioxide filter is full, what now?", "periodic tremor under the landing basin every six hours", "CB-9X"];
const tip = { contentStyle: { background: "#151515", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: 12 }, cursor: { fill: "rgba(255,255,255,.04)" } };

export default function Retrieval() {
  const [q, setQ] = useState(SAMPLES[0]);
  const [res, setRes] = useState<any>(null);
  const [cmp, setCmp] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api("/evals/retrieval_compare").then(setCmp).catch(() => {}); }, []);
  async function run(query = q) {
    setBusy(true); setErr(null); setQ(query);
    try { setRes(await post("/search", { query, k: 5, modes: MODES })); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }
  const rows = cmp?.table?.map((t: any) => ({ method: t.method.replace("hybrid_rerank_", "rerank·"), "hit@3": t.hit, MRR: t.mrr, recall: t.ctx_recall, ms: t.latency_ms })) ?? [];

  return (
    <div data-tone="retrieval">
      <PageHeader tone="retrieval" icon={Search} eyebrow="Module 4 · Advanced RAG" title="Retrieval Lab" />
      <Card strip className="reveal mb-5">
        <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="rq" className="sr-only">Query</label>
          <input id="rq" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11 flex-1 rounded-tl-xl rounded-br-xl border border-line bg-bg px-4 text-sm text-heading outline-none focus:border-[var(--c)]" />
          <Button disabled={busy}>{busy ? "Searching…" : "Compare strategies"}</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">{SAMPLES.map((s) => <button key={s} onClick={() => run(s)} className="rounded-full border border-line px-3 py-1.5 font-mono text-xs text-muted hover:border-[var(--c)] hover:text-heading">{s}</button>)}</div>
      </Card>
      <ErrorNote error={err} />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {MODES.map((m, i) => (
          <Card key={m} tone={MODE_TONE[m]} strip className="reveal" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="mb-3 flex items-center justify-between"><span className="font-mono text-sm font-semibold" style={{ color: "var(--c)" }}>{m}</span>{res?.[m] && <span className="font-mono text-[11px] text-muted">{res[m].ms}ms</span>}</div>
            {busy ? <Spinner label="" /> : !res ? <p className="text-xs text-muted">Run a query to compare.</p> : (
              <ol className="space-y-2">
                {res[m].hits.map((h: any, j: number) => (
                  <li key={j} className="rounded-tl-lg rounded-br-lg border border-line p-2.5">
                    <div className="flex items-center justify-between gap-2"><Badge>{h.doc_id}</Badge><span className="font-mono text-[11px] text-heading">{h.score.toFixed(3)}</span></div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted">{h.heading}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Scores aren&apos;t comparable across columns: cosine (dense), BM25 weights, RRF rank-fusion and cross-encoder logits live on different scales. That&apos;s why hybrid fuses <em>ranks</em>.</p>

      <Card className="reveal mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-heading">Benchmark: {cmp ? `${cmp.n_queries} golden queries, k=${cmp.k}` : "not run yet"}</h2>
          <span className="font-mono text-[11px] text-muted">evals/compare_retrieval.py</span>
        </div>
        {!rows.length ? <Empty>Run <code className="font-mono">uv run python -m evals.compare_retrieval</code> in backend/.</Empty> : (
          <>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={rows} margin={{ left: -18 }}>
                  <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                  <XAxis dataKey="method" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1]} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="hit@3" fill="#fb923c" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="MRR" fill="#22d3ee" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="recall" fill="#c084fc" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted"><th className="py-2">Method</th><th>hit@3</th><th>MRR</th><th>Recall</th><th>Latency</th><th>Hit by query kind</th></tr></thead>
                <tbody>
                  {cmp.table.map((t: any) => (
                    <tr key={t.method} className="border-b border-line/60">
                      <td className="py-2.5 font-mono text-heading">{t.method}</td><td>{t.hit.toFixed(2)}</td><td>{t.mrr.toFixed(2)}</td><td>{t.ctx_recall.toFixed(2)}</td><td className="font-mono">{t.latency_ms}ms</td>
                      <td className="text-xs text-muted">{Object.entries(t.hit_by_kind).map(([k, v]) => `${k} ${v}`).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
