"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, Clock, Coins, Crosshair, Gauge, GitCommit, RefreshCw, Shuffle } from "lucide-react";
import { Button, Card, Empty, ErrorNote, PageHeader, Stat } from "@/components/ui";
import { api, pct } from "@/lib/api";

const tip = { contentStyle: { background: "#151515", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: 12 }, cursor: { fill: "rgba(255,255,255,.04)" } };

export default function Telemetry() {
  const [m, setM] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api("/metrics").then(setM).catch((e) => setErr(String(e)));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const rq = m?.requests;
  const series = (rq?.series ?? []).map((r: any) => ({ t: r.ts * 1000, ms: r.ms, err: r.status >= 500 }));
  const rows = m?.by_tag ? Object.entries(m.by_tag).map(([tag, v]: any) => ({ tag, ...v })) : [];

  return (
    <div data-tone="telemetry">
      <PageHeader tone="telemetry" icon={Gauge} eyebrow="Module 7 · observability" title="Telemetry">
        <Button variant="outline" onClick={load}><RefreshCw size={15} />Refresh</Button>
      </PageHeader>
      <ErrorNote error={err} />
      {m && <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted">
        <span className="flex items-center gap-1"><GitCommit size={12} />commit {m.commit}</span>
        <span>window {m.window_hours}h</span>
        <span>tracing {m.tracing ? "LangSmith on (PII redacted)" : "off"}</span>
      </p>}
      {!m || !m.calls ? <Card><Empty icon={Activity}>No LLM calls in this window. Ask a question or launch an investigation; every call is logged with latency, tokens and cost.</Empty></Card> : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat i={0} tone="mission" icon={Clock} label="Query latency p50 / p95" value={rq?.p50_ms != null ? `${(rq.p50_ms / 1000).toFixed(1)}s` : "–"} sub={`p95 ${rq?.p95_ms != null ? (rq.p95_ms / 1000).toFixed(1) : "–"}s over ${rq?.n ?? 0} queries`} />
            <Stat i={1} tone="evals" icon={Coins} label="Cost per query" value={`$${(rq?.cost_per_query_usd ?? 0).toFixed(5)}`} sub={`${(rq?.tokens_per_query ?? 0).toLocaleString()} tokens / query`} />
            <Stat i={2} tone="telemetry" icon={AlertTriangle} label="Error rate" value={pct(rq?.error_rate)} sub={`${rq?.errors ?? 0} errors · ${m.llm_errors} LLM failures · ${rq?.rate_limited ?? 0} rate-limited`} />
            <Stat i={3} tone="learn" icon={Crosshair} label={`Retrieval hit@${m.retrieval?.k ?? 3}`} value={pct(m.retrieval?.hit_at_k)} sub={m.retrieval ? `offline eval, ${m.retrieval.n_queries} golden queries` : "run evals.compare_retrieval"} />
          </div>
          <Card strip tone="mission"><h2 className="mb-4 font-semibold text-heading">Query latency over time (red = 5xx)</h2>
            <div className="h-56"><ResponsiveContainer><ScatterChart margin={{ left: -4 }}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="ms" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} unit="ms" />
              <Tooltip {...tip} labelFormatter={(t) => new Date(Number(t)).toLocaleString()} />
              <Scatter data={series.filter((d: any) => !d.err)} fill="#2dd4bf" isAnimationActive={false} />
              <Scatter data={series.filter((d: any) => d.err)} fill="#f87171" isAnimationActive={false} /></ScatterChart></ResponsiveContainer></div></Card>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat i={0} tone="telemetry" icon={Activity} label="LLM calls" value={m.calls} sub={`${m.tokens.toLocaleString()} tokens`} />
            <Stat i={1} tone="mission" icon={Clock} label="LLM call p50 / p95" value={`${m.p50_ms}ms`} sub={`p95 ${m.p95_ms}ms`} />
            <Stat i={2} tone="evals" icon={Coins} label="LLM spend (window)" value={`$${m.cost_usd.toFixed(4)}`} sub="list prices, estimate" />
            <Stat i={3} tone="learn" icon={Shuffle} label="Provider fallbacks" value={m.fallbacks} sub="Groq → DeepSeek" />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card strip><h2 className="mb-4 font-semibold text-heading">Avg latency by step (ms)</h2>
              <div className="h-64"><ResponsiveContainer><BarChart data={rows} margin={{ left: -10 }}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="tag" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...tip} /><Bar dataKey="avg_ms" fill="#2dd4bf" radius={[6, 6, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></Card>
            <Card strip tone="evals"><h2 className="mb-4 font-semibold text-heading">Tokens by step</h2>
              <div className="h-64"><ResponsiveContainer><BarChart data={rows} margin={{ left: -4 }}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="tag" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...tip} /><Bar dataKey="tokens" fill="#34d399" radius={[6, 6, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></Card>
          </div>
          <Card>
            <h2 className="mb-3 font-semibold text-heading">Recent calls</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] font-mono text-xs">
                <thead><tr className="border-b border-line text-left uppercase tracking-wider text-muted"><th className="py-2">Step</th><th>Model</th><th>ms</th><th>in</th><th>out</th><th>cost</th></tr></thead>
                <tbody>{[...m.recent].reverse().map((c: any, i: number) => (
                  <tr key={i} className="border-b border-line/60"><td className="py-2 text-heading">{c.tag}</td><td className="text-muted">{c.model}</td><td>{c.ms}</td><td>{c.in}</td><td>{c.out}</td><td>${c.cost.toFixed(5)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
