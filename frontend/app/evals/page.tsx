"use client";
import { useEffect, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { CheckCircle2, FlaskConical, XCircle } from "lucide-react";
import { Badge, Card, Empty, ErrorNote, Meter, PageHeader } from "@/components/ui";
import { api, pct } from "@/lib/api";

const RUN_COLORS = ["#34d399", "#22d3ee", "#c084fc", "#fb923c"];
const METRICS = ["correctness", "groundedness", "relevance", "hit", "mrr", "ctx_precision", "ctx_recall"];
const tip = { contentStyle: { background: "#151515", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: 12 } };

export default function Evals() {
  const [all, setAll] = useState<any>({});
  const [tag, setTag] = useState("baseline");
  const [detail, setDetail] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api("/evals").then(setAll).catch((e) => setErr(String(e)));
    api("/evals/agent_eval").then(setAgent).catch(() => {});
  }, []);
  useEffect(() => { api(`/evals/${tag}`).then(setDetail).catch(() => setDetail(null)); }, [tag]);

  const ragRuns = Object.entries(all).filter(([, v]: any) => v.config?.models_used || v.config?.k).map(([k, v]: any) => ({ tag: k, ...v }));
  const radar = METRICS.map((m) => Object.fromEntries([["metric", m], ...ragRuns.map((r) => [r.tag, r.summary?.[m] ?? 0])]));
  const ragas = Object.entries(all).filter(([k]) => k.startsWith("ragas_")).map(([k, v]: any) => ({ ...v, tag: k.replace("ragas_", "") }));

  return (
    <div data-tone="evals">
      <PageHeader tone="evals" icon={FlaskConical} eyebrow="Modules 2 & 5 · measured, not eyeballed" title="Evaluations" />
      <ErrorNote error={err} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card strip className="reveal lg:col-span-3">
          <h2 className="mb-1 font-display text-lg font-semibold text-heading">RAG experiments</h2>
          <p className="mb-3 text-xs text-muted">Same 18-question golden set, judge = DeepSeek. Only one variable changes per run.</p>
          {ragRuns.length === 0 ? <Empty>No runs.</Empty> : (
            <div className="h-80">
              <ResponsiveContainer>
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke="rgba(255,255,255,.1)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  {ragRuns.map((r, i) => <Radar key={r.tag} name={r.tag} dataKey={r.tag} stroke={RUN_COLORS[i % 4]} fill={RUN_COLORS[i % 4]} fillOpacity={0.08} strokeWidth={2} isAnimationActive={false} dot={{ r: 2.5 }} />)}
                  <Legend wrapperStyle={{ fontSize: 12 }} /><Tooltip {...tip} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card className="reveal lg:col-span-2">
          <h2 className="mb-3 font-display text-lg font-semibold text-heading">Runs</h2>
          <ul className="space-y-2">
            {ragRuns.map((r, i) => (
              <li key={r.tag}>
                <button onClick={() => setTag(r.tag)} className={`w-full rounded-tl-xl rounded-br-xl border p-3 text-left transition-colors ${tag === r.tag ? "border-[color-mix(in_srgb,var(--c)_50%,transparent)] bg-[var(--accent-soft)]" : "border-line hover:border-line-strong"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-mono text-sm text-heading"><span className="h-2.5 w-2.5 rounded-full" style={{ background: RUN_COLORS[i % 4] }} />{r.tag}</span>
                    <span className="font-display text-lg font-bold text-heading">{pct(r.summary.pass_rate)}</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted">{(r.config.models_used ?? [r.config.model]).join(",")} · {r.config.mode} · k={r.config.k} · ${(r.summary.gen_cost_usd + (r.summary.judge_cost_usd ?? 0)).toFixed(3)}</p>
                </button>
              </li>
            ))}
          </ul>
          {ragas.map((x: any) => (
            <div key={x.tag} className="mt-4 rounded-tl-xl rounded-br-xl border border-line p-3">
              <p className="mb-2 text-xs uppercase tracking-wider text-muted">RAGAS cross-check · {x.tag}</p>
              {Object.keys(x.ragas).map((k) => <p key={k} className="flex justify-between font-mono text-[11px]"><span className="text-muted">{k.replace("llm_context_", "ctx_").replace("_with_reference", "")}</span><span className="text-heading">ragas {x.ragas[k].toFixed(2)} · ours {x.ours[k].toFixed(2)}</span></p>)}
            </div>
          ))}
        </Card>
      </div>

      {detail?.cases && (
        <Card className="reveal mt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-heading">Test cases · {tag}</h2>
            <div className="flex flex-wrap gap-2">{Object.entries(detail.summary.by_category).map(([k, v]: any) => <Badge key={k} kind="muted">{k} {v}</Badge>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {METRICS.map((m) => <Meter key={m} label={m} value={detail.summary[m] ?? 0} />)}
          </div>
          <ul className="mt-6 space-y-2">
            {detail.cases.map((c: any) => (
              <li key={c.id} className="rounded-tl-xl rounded-br-xl border border-line">
                <button onClick={() => setOpen(open === c.id ? null : c.id)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left">
                  {c.passed ? <CheckCircle2 size={16} className="text-ok" /> : <XCircle size={16} className="text-danger" />}
                  <span className="font-mono text-xs text-muted">{c.id}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-heading">{c.question}</span>
                  <Badge kind="muted">{c.category}</Badge>
                  <span className="flex gap-1">{Object.entries(c.verdicts).map(([m, v]: any) => <span key={m} title={m} className={`h-2 w-2 rounded-full ${v.passed ? "bg-ok" : "bg-danger"}`} />)}</span>
                </button>
                {open === c.id && (
                  <div className="reveal grid gap-4 border-t border-line p-4 lg:grid-cols-2">
                    <div className="space-y-2 text-sm">
                      <p><span className="text-xs uppercase tracking-wider text-muted">Answer</span><br />{c.answer}</p>
                      <p><span className="text-xs uppercase tracking-wider text-muted">Reference</span><br /><span className="text-text/80">{c.reference}</span></p>
                      <p className="font-mono text-[11px] text-muted">retrieved: {c.retrieved.join(" · ")}</p>
                    </div>
                    <ul className="space-y-2">
                      {Object.entries(c.verdicts).map(([m, v]: any) => (
                        <li key={m} className="rounded-lg bg-surface-2 p-2.5">
                          <p className="flex items-center gap-2 text-xs font-semibold"><span className={v.passed ? "text-ok" : "text-danger"}>{v.passed ? "PASS" : "FAIL"}</span><span className="text-heading">{m}</span></p>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted">{v.explanation}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card tone="investigate" strip className="reveal mt-5">
        <h2 className="mb-1 font-display text-lg font-semibold text-heading">Agent evaluation · trajectories</h2>
        <p className="mb-4 text-xs text-muted">Scores the whole execution: route, tools called, approval pause, recovery from injected faults, and safety.</p>
        {!agent ? <Empty>Run <code className="font-mono">uv run python -m evals.agent_eval --adversarial</code> in backend/.</Empty> : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(agent.summary).filter(([, v]) => typeof v === "number" && (v as number) <= 1).map(([k, v]: any) => <Meter key={k} label={k} value={v} />)}
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted"><th className="py-2">Scenario</th><th>Route</th><th>Paused</th><th>Tools</th><th>Checks</th></tr></thead>
                <tbody>
                  {agent.cases.map((c: any) => (
                    <tr key={c.id} className="border-b border-line/60 align-top">
                      <td className="py-2.5"><span className="mr-2">{c.passed ? "✅" : "❌"}</span><span className="font-mono text-xs text-heading">{c.id}</span></td>
                      <td className="font-mono text-xs">{c.route}</td><td className="text-xs">{c.paused ? "yes" : "no"}</td>
                      <td className="font-mono text-[11px] text-muted">{c.tools.join(" → ") || "–"}</td>
                      <td className="flex flex-wrap gap-1 py-2">{Object.entries(c.scores).map(([k, v]: any) => <Badge key={k} kind={v ? "ok" : "danger"}>{k}</Badge>)}</td>
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
