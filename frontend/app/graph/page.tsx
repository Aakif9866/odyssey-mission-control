"use client";
import { useEffect, useMemo, useState } from "react";
import { GitBranch, Route } from "lucide-react";
import { Badge, Card, Empty, ErrorNote, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

// Layout only (positions). Nodes and edges themselves come from the compiled LangGraph via /graph.
const POS: Record<string, [number, number]> = {
  __start__: [450, 34], guard_input: [450, 104], classify: [450, 184], refuse: [790, 184], rag_answer: [130, 330],
  agent: [450, 290], tools: [720, 290], assess: [450, 400], human_approval: [690, 480], recommend: [450, 560],
  guard_output: [290, 640], __end__: [290, 712],
};
const COLOR: Record<string, string> = { guard_input: "#2dd4bf", guard_output: "#2dd4bf", classify: "#a5b4fc", rag_answer: "#93c5fd", agent: "#c084fc",
  tools: "#fb923c", assess: "#f472b6", human_approval: "#fbbf24", recommend: "#34d399", refuse: "#f87171", __start__: "#6b7280", __end__: "#6b7280" };

export default function GraphPage() {
  const [g, setG] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [run, setRun] = useState<any>(null);
  const [node, setNode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/graph").then(setG).catch((e) => setErr(String(e)));
    api("/runs?limit=30").then((r) => { setRuns(r); if (r[0]) pick(r[0].thread_id); }).catch(() => {});
  }, []);
  const pick = (id: string) => api(`/runs/${id}`).then((r) => { setRun(r); setNode(null); });

  const path: string[] = useMemo(() => (run?.trace ? ["__start__", ...run.trace.map((t: any) => t.node), ...(run.status === "done" ? ["__end__"] : [])] : []), [run]);
  const visits = useMemo(() => path.reduce((a: Record<string, number>, n) => ((a[n] = (a[n] ?? 0) + 1), a), {}), [path]);
  const walked = useMemo(() => new Set(path.slice(1).map((n, i) => `${path[i]}>${n}`)), [path]);
  const nodeEvents = run?.trace?.filter((t: any) => t.node === node) ?? [];

  const edgePath = (s: string, t: string) => {
    const [x1, y1] = POS[s] ?? [0, 0], [x2, y2] = POS[t] ?? [0, 0];
    if (s === "tools" && t === "agent") return `M ${x1 - 60} ${y1 - 10} C ${x1 - 100} ${y1 - 50}, ${x2 + 100} ${y2 - 50}, ${x2 + 60} ${y2 - 10}`;
    if (s === "agent" && t === "tools") return `M ${x1 + 60} ${y1 + 10} C ${x1 + 100} ${y1 + 50}, ${x2 - 100} ${y2 + 50}, ${x2 - 60} ${y2 + 10}`;
    const my = (y1 + y2) / 2;
    return `M ${x1} ${y1 + 16} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - 16}`;
  };

  return (
    <div data-tone="graph">
      <PageHeader tone="graph" icon={GitBranch} eyebrow="Module 3 · observable execution" title="Graph & Traces" />
      <ErrorNote error={err} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="reveal overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-6 bg-white/25" />edge</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-6 border-t border-dashed border-white/40" />conditional</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-6" style={{ background: "var(--gb)" }} />path taken by selected run</span>
          </div>
          {!g ? <Empty>Loading graph from backend…</Empty> : (
            <svg viewBox="0 0 900 750" className="min-w-[640px] w-full" role="img" aria-label="LangGraph workflow with the selected run's execution path">
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="rgba(255,255,255,.35)" /></marker>
                <marker id="arrHot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#f472b6" /></marker>
                <linearGradient id="hot" x1="0" x2="1"><stop offset="0" stopColor="#f472b6" /><stop offset="1" stopColor="#c084fc" /></linearGradient>
              </defs>
              {g.edges.map((e: any, i: number) => {
                const hot = walked.has(`${e.source}>${e.target}`);
                return <path key={i} d={edgePath(e.source, e.target)} fill="none" stroke={hot ? "url(#hot)" : "rgba(255,255,255,.18)"} strokeWidth={hot ? 2.5 : 1.3}
                  strokeDasharray={e.conditional && !hot ? "5 5" : undefined} className={hot ? "dash-flow" : ""} markerEnd={hot ? "url(#arrHot)" : "url(#arr)"} />;
              })}
              {g.nodes.map((n: string) => {
                const [x, y] = POS[n] ?? [0, 0];
                const terminal = n.startsWith("__");
                const v = visits[n] ?? 0;
                const c = COLOR[n] ?? "#9ca3af";
                return (
                  <g key={n} transform={`translate(${x},${y})`} onClick={() => !terminal && setNode(n)} className={terminal ? "" : "cursor-pointer"} role={terminal ? undefined : "button"} aria-label={terminal ? undefined : `${n}, visited ${v} times`}>
                    {terminal ? <circle r={13} fill="#0a0a0a" stroke={v ? c : "rgba(255,255,255,.25)"} strokeWidth={2} /> : (
                      <>
                        {v > 0 && <rect x={-72} y={-21} width={144} height={42} rx={14} fill={c} opacity={0.18} filter="blur(6px)" />}
                        <rect x={-68} y={-18} width={136} height={36} rx={12} fill="#0a0a0a" stroke={v ? c : "rgba(255,255,255,.18)"} strokeWidth={node === n ? 2.5 : 1.4} />
                        <text textAnchor="middle" dy={5} fill={v ? "#fff" : "#9ca3af"} fontSize={12.5} fontFamily="var(--font-mono)">{n}</text>
                        {v > 1 && <g transform="translate(62,-16)"><circle r={10} fill={c} /><text textAnchor="middle" dy={4} fontSize={10.5} fill="#000" fontWeight={700}>×{v}</text></g>}
                      </>
                    )}
                    {terminal && <text textAnchor="middle" dy={30} fill="#6b7280" fontSize={10.5} fontFamily="var(--font-mono)">{n.replaceAll("_", "")}</text>}
                  </g>
                );
              })}
            </svg>
          )}
        </Card>

        <div className="space-y-5">
          <Card tone="graph" strip>
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-heading"><Route size={16} style={{ color: "var(--c)" }} />Runs</h2>
            {runs.length === 0 ? <p className="text-sm text-muted">No runs yet. Launch an investigation.</p> : (
              <ul className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto">
                {runs.map((r) => (
                  <li key={r.thread_id}>
                    <button onClick={() => pick(r.thread_id)} className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${run?.thread_id === r.thread_id ? "bg-[var(--accent-soft)]" : "hover:bg-white/[0.04]"}`}>
                      <p className="truncate text-sm text-heading">{r.query}</p>
                      <p className="font-mono text-[10px] text-muted">{r.thread_id} · {r.route} · {r.status}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card tone={node ? undefined : "graph"}>
            {!node ? (
              run ? <>
                <p className="text-xs uppercase tracking-wider text-muted">Selected run</p>
                <p className="mt-1 text-sm text-heading">{run.query}</p>
                <div className="mt-3 flex flex-wrap gap-2"><Badge>{run.route}</Badge><Badge kind={run.status === "done" ? "ok" : "warn"}>{run.status}</Badge>{run.approval && <Badge kind={run.approval === "approved" ? "ok" : "danger"}>{run.approval}</Badge>}</div>
                <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted">{path.join(" → ")}</p>
                <p className="mt-3 text-xs text-muted">Click a node to see what it did in this run.</p>
              </> : <Empty icon={GitBranch}>Select a run.</Empty>
            ) : (
              <>
                <div className="flex items-center justify-between"><p className="font-mono text-sm font-semibold" style={{ color: COLOR[node] }}>{node}</p><button onClick={() => setNode(null)} className="text-xs text-muted hover:text-heading">back</button></div>
                {nodeEvents.length === 0 ? <p className="mt-3 text-sm text-muted">Not executed in this run.</p> : (
                  <ol className="mt-3 space-y-2">
                    {nodeEvents.map((e: any, i: number) => <li key={i} className="rounded-tl-lg rounded-br-lg border border-line p-2.5"><p className="font-mono text-[11px] text-muted">call {i + 1} · {e.ms}ms</p><p className="mt-1 text-xs text-text">{e.summary}</p></li>)}
                  </ol>
                )}
                {node === "tools" && run.tool_calls?.length > 0 && <p className="mt-3 font-mono text-[11px] text-muted">{run.tool_calls.map((t: any) => t.name + (t.ok ? "" : "✗")).join(" · ")}</p>}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
