"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Clock, Coins, Gauge, RefreshCw, Shuffle } from "lucide-react";
import { Button, Card, Empty, ErrorNote, PageHeader, Stat } from "@/components/ui";
import { api } from "@/lib/api";

const tip = { contentStyle: { background: "#151515", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: 12 }, cursor: { fill: "rgba(255,255,255,.04)" } };

export default function Telemetry() {
  const [m, setM] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api("/metrics").then(setM).catch((e) => setErr(String(e)));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const rows = m?.by_tag ? Object.entries(m.by_tag).map(([tag, v]: any) => ({ tag, ...v })) : [];

  return (
    <div data-tone="telemetry">
      <PageHeader tone="telemetry" icon={Gauge} eyebrow="Module 7 · observability" title="Telemetry">
        <Button variant="outline" onClick={load}><RefreshCw size={15} />Refresh</Button>
      </PageHeader>
      <ErrorNote error={err} />
      {!m || !m.calls ? <Card><Empty icon={Activity}>No LLM calls since the API started. Ask a question or launch an investigation; every call is logged with latency, tokens and cost.</Empty></Card> : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat i={0} tone="telemetry" icon={Activity} label="LLM calls" value={m.calls} sub={`${m.tokens.toLocaleString()} tokens`} />
            <Stat i={1} tone="mission" icon={Clock} label="Latency p50 / p95" value={`${m.p50_ms}ms`} sub={`p95 ${m.p95_ms}ms`} />
            <Stat i={2} tone="evals" icon={Coins} label="Spend (session)" value={`$${m.cost_usd.toFixed(4)}`} sub="list prices, estimate" />
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
