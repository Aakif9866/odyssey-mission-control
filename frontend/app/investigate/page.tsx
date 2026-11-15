"use client";
import { useRef, useState } from "react";
import { AlertOctagon, CheckCircle2, Circle, FileText, Gavel, Play, Radar, ShieldAlert, Wrench, XCircle, Zap } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { API } from "@/lib/api";

const PRESETS = ["Investigate anomaly ANM-0042 and recommend next steps",
  "Is the ODY-05 Deepwater mission ready to launch? Check its live status and recommend next steps.",
  "Investigate the current crew situation on Meridian and whether any crew issue affects operations.",
  "Investigate the latest relay transmission about ODY-05 and what it means for the radiation waiver."];
const NODE_TONE: Record<string, string> = { guard_input: "telemetry", classify: "assistant", rag_answer: "docs", agent: "investigate", tools: "retrieval",
  assess: "graph", human_approval: "learn", recommend: "evals", guard_output: "telemetry", refuse: "graph" };

type Ev = { node: string; ms: number; summary: string; tool_calls?: any[] };

export default function Investigate() {
  const [q, setQ] = useState(PRESETS[0]);
  const [fault, setFault] = useState("");
  const [events, setEvents] = useState<Ev[]>([]);
  const [pending, setPending] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const thread = useRef<string | null>(null);

  function stream(params: Record<string, string>) {
    setBusy(true); setErr(null);
    const url = `${API}/investigate/stream?${new URLSearchParams(params)}`;
    const es = new EventSource(url);
    es.addEventListener("start", (e) => { thread.current = JSON.parse((e as MessageEvent).data).thread_id; });
    es.addEventListener("node", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      (d.trace ?? []).forEach((t: Ev) => setEvents((x) => [...x, { ...t, tool_calls: d.tool_calls }]));
    });
    es.addEventListener("interrupt", (e) => setPending(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("error", (e: any) => { if (e.data) setErr(JSON.parse(e.data).message); });
    es.addEventListener("done", (e) => { setResult(JSON.parse((e as MessageEvent).data)); setBusy(false); es.close(); });
    es.onerror = () => { if (es.readyState === EventSource.CLOSED) return; setErr("stream failed: is the backend running on :8000?"); setBusy(false); es.close(); };
  }

  function launch() {
    setEvents([]); setPending(null); setResult(null);
    stream({ query: q, ...(fault ? { fault } : {}) });
  }
  function decide(d: "approved" | "rejected") {
    setPending(null); setResult(null);
    stream({ query: q, thread_id: thread.current!, decision: d });
  }

  const tools = result?.tool_calls ?? [];
  const evidence: any[] = Object.values(Object.fromEntries((result?.evidence ?? []).map((e: any) => [e.doc_id, e])));
  const total = events.reduce((a, e) => a + e.ms, 0);

  return (
    <div data-tone="investigate">
      <PageHeader tone="investigate" icon={Radar} eyebrow="Module 3 · LangGraph agent" title="Investigations" />

      <Card strip className="reveal mb-5">
        <label htmlFor="iq" className="text-xs uppercase tracking-wider text-muted">Directive</label>
        <textarea id="iq" value={q} onChange={(e) => setQ(e.target.value)} rows={2}
          className="mt-2 w-full resize-none rounded-tl-xl rounded-br-xl border border-line bg-bg p-3 text-sm text-heading outline-none focus:border-[var(--c)]" />
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => <button key={p} onClick={() => setQ(p)} className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-[var(--c)] hover:text-heading">{p.slice(0, 48)}…</button>)}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={launch} disabled={busy || !q.trim()}><Play size={16} />Launch</Button>
          <label className="flex items-center gap-2 text-xs text-muted">
            <Zap size={13} className="text-warn" />Inject tool fault
            <select value={fault} onChange={(e) => setFault(e.target.value)} className="min-h-9 rounded-md border border-line bg-bg px-2 text-xs text-heading">
              <option value="">none</option><option>search_docs</option><option>get_mission</option><option>get_crew</option>
            </select>
          </label>
          {busy && <Spinner label="Agent executing" />}
          {thread.current && <span className="ml-auto font-mono text-[11px] text-muted">thread {thread.current}</span>}
        </div>
      </Card>
      <ErrorNote error={err} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-heading">Execution trace</h2>
            {events.length > 0 && <span className="font-mono text-[11px] text-muted">{events.length} steps · {(total / 1000).toFixed(1)}s</span>}
          </div>
          {events.length === 0 ? <Empty icon={Radar}>Each graph node appears here as it finishes, streamed live from the backend.</Empty> : (
            <ol className="relative space-y-1 border-l border-line pl-5">
              {events.map((e, i) => (
                <li key={i} data-tone={NODE_TONE[e.node] ?? "investigate"} className="reveal relative pb-3">
                  <span className="absolute -left-[26px] top-1 grid h-3 w-3 place-items-center rounded-full" style={{ background: "var(--c)", boxShadow: "0 0 10px var(--c)" }} />
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium" style={{ color: "var(--c)" }}>{e.node}</span>
                    <span className="font-mono text-[11px] text-muted">{e.ms}ms</span>
                  </div>
                  <p className="mt-0.5 text-xs text-text/80">{e.summary}</p>
                </li>
              ))}
              {busy && <li className="pl-0 text-xs text-muted"><Circle size={10} className="pulse-dot mr-2 inline" />running…</li>}
            </ol>
          )}
        </Card>

        <div className="space-y-5 lg:col-span-3">
          {pending && (
            <Card tone="learn" strip className="reveal border-warn/40">
              <div className="flex items-start gap-3">
                <span className="chip-icon grid h-10 w-10 shrink-0 place-items-center rounded-tl-xl rounded-br-xl"><Gavel size={18} /></span>
                <div className="flex-1">
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-warn">Paused · Director approval required</p>
                  <p className="mt-1 font-semibold text-heading">{pending.proposed_action}</p>
                  <p className="mt-2 text-sm text-muted">{pending.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-2"><Badge kind="muted">confidence {pending.confidence}</Badge>{pending.citations?.map((c: string) => <Badge key={c}>{c}</Badge>)}</div>
                  <div className="mt-4 flex gap-3" data-tone="evals">
                    <Button onClick={() => decide("approved")}><CheckCircle2 size={16} />Approve</Button>
                    <Button variant="outline" onClick={() => decide("rejected")} className="!border-danger/60 !text-danger hover:!bg-danger hover:!text-black"><XCircle size={16} />Reject</Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {result?.answer && result.status === "done" && (
            <Card tone="evals" strip className="reveal">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-heading">Recommendation</h2>
                {result.approval && <Badge kind={result.approval === "approved" ? "ok" : "danger"}>Director {result.approval}</Badge>}
              </div>
              <p className="text-sm leading-relaxed text-text">{result.answer}</p>
              <div className="mt-3 flex flex-wrap gap-2">{result.citations?.map((c: string) => <Badge key={c}><FileText size={11} />{c}</Badge>)}</div>
            </Card>
          )}

          {(result?.flags?.length ?? 0) > 0 && (
            <Card tone="graph" className="reveal">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-heading"><ShieldAlert size={16} className="text-danger" />Guardrail findings</p>
              <ul className="space-y-1">{result.flags.map((f: string) => <li key={f} className="font-mono text-xs text-danger">{f}</li>)}</ul>
            </Card>
          )}

          {result?.assessment && (
            <Card tone="graph" className="reveal">
              <h3 className="mb-2 font-semibold text-heading">Assessment</h3>
              <p className="text-sm text-text/90">{result.assessment.summary}</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div><p className="text-xs uppercase tracking-wider text-muted">Hypotheses (ranked)</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm">{result.assessment.hypotheses.map((h: string) => <li key={h}>{h}</li>)}</ol></div>
                <div><p className="text-xs uppercase tracking-wider text-muted">Evidence gaps</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted">{result.assessment.gaps.map((g: string) => <li key={g}>{g}</li>)}</ul></div>
              </div>
            </Card>
          )}

          {tools.length > 0 && (
            <Card tone="retrieval" className="reveal">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-heading"><Wrench size={16} style={{ color: "var(--c)" }} />Tool calls</h3>
              <ul className="space-y-2">
                {tools.map((t: any, i: number) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 rounded-tl-lg rounded-br-lg border border-line px-3 py-2">
                    {t.ok ? <CheckCircle2 size={14} className="text-ok" /> : <AlertOctagon size={14} className="text-danger" />}
                    <span className="font-mono text-sm text-heading">{t.name}</span>
                    <code className="truncate font-mono text-[11px] text-muted">{JSON.stringify(t.args)}</code>
                    <span className="ml-auto font-mono text-[11px] text-muted">{t.ms}ms</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {evidence.length > 0 && (
            <Card tone="docs" className="reveal">
              <h3 className="mb-3 font-semibold text-heading">Evidence ({evidence.length} sources)</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {evidence.map((e: any) => (
                  <div key={e.doc_id} className="rounded-tl-xl rounded-br-xl border border-line p-3">
                    <div className="mb-1 flex items-center justify-between gap-2"><Badge>{e.doc_id}</Badge><span className="font-mono text-[10px] text-muted">via {e.via}</span></div>
                    <p className="line-clamp-4 text-xs text-text/75">{e.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
