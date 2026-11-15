"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Bot, Boxes, FileText, FlaskConical, Orbit, Radar, ShieldCheck, Users } from "lucide-react";
import { Badge, Card, ErrorNote, Ring, Stat, Button } from "@/components/ui";
import { api, pct } from "@/lib/api";

const PLANET_TONE: Record<string, string> = { "Kepler-Vex": "mission", Cinder: "retrieval", "Thalassa Prime": "assistant" };

export default function Home() {
  const [health, setHealth] = useState<any>(null);
  const [missions, setMissions] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [evals, setEvals] = useState<any>({});
  const [runs, setRuns] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api("/health"), api("/missions"), api("/documents"), api("/evals"), api("/runs?limit=6")])
      .then(([h, m, d, e, r]) => { setHealth(h); setMissions(m); setDocs(d); setEvals(e); setRuns(r); })
      .catch((e) => setErr(String(e)));
  }, []);

  const base = evals.baseline?.summary;
  const agent = evals.agent_eval?.summary;
  const pending = missions.flatMap((m) => (m.pending_approvals ?? []).map((p: string) => ({ mission: m.id, p })));

  return (
    <div className="space-y-6">
      <section data-tone="investigate" className="card reveal relative overflow-hidden p-6 lg:p-10">
        <div className="glow -right-20 -top-24" />
        <div className="glow -bottom-32 left-1/3" data-tone="mission" style={{ opacity: 0.18 }} />
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted">Helios Exploration Directorate · 2241</p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-tight text-heading lg:text-6xl">
          Mission intelligence, <span className="text-grad">grounded in evidence.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-text/80">Ask about any planet, mission or manual. Launch investigations that gather evidence, call tools and pause for the Director before anything risky.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/investigate"><Button>Launch investigation <ArrowRight size={16} /></Button></Link>
          <Link href="/assistant" data-tone="assistant"><Button variant="outline">Ask the assistant</Button></Link>
        </div>
      </section>

      <ErrorNote error={err} />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={0} tone="docs" icon={FileText} label="Documents" value={docs.length || "–"} sub={`${health?.chunks ?? "–"} indexed chunks`} />
        <Stat i={1} tone="mission" icon={Orbit} label="Missions" value={missions.length || "–"} sub={`retrieval: ${health?.retrieval_mode ?? "–"}`} />
        <Stat i={2} tone="evals" icon={FlaskConical} label="RAG pass rate" value={pct(base?.pass_rate)} sub={`groundedness ${pct(base?.groundedness)}`} />
        <Stat i={3} tone="investigate" icon={ShieldCheck} label="Agent pass rate" value={pct(agent?.pass_rate)} sub={agent ? `${agent.n} scenarios` : "run agent_eval"} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {missions.map((m, i) => (
          <Card key={m.id} tone={PLANET_TONE[m.planet] ?? "mission"} strip hover className="reveal" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs" style={{ color: "var(--c)" }}>{m.id}</p>
                <h3 className="font-display text-xl font-bold text-heading">{m.name}</h3>
                <p className="text-sm text-muted">{m.planet}</p>
              </div>
              <Badge kind={m.risk_class === "A" ? "warn" : "muted"}>risk {m.risk_class}</Badge>
            </div>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd className="text-right text-heading">{m.status}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Crew</dt><dd className="flex items-center gap-1 text-heading"><Users size={13} />{m.crew_size}</dd></div>
              {m.commander && <div className="flex justify-between gap-3"><dt className="text-muted">Command</dt><dd className="text-right text-heading">{m.commander.split(" (")[0]}</dd></div>}
            </dl>
            {(m.pending_approvals ?? []).length > 0 && (
              <div className="mt-5 rounded-tl-lg rounded-br-lg border border-warn/30 bg-warn/5 p-3 text-xs text-warn">
                <AlertTriangle size={13} className="mr-1 inline" />{m.pending_approvals.length} pending Director approval
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card tone="investigate" className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-heading">Recent investigations</h2>
            <Link href="/graph" className="text-sm hover:underline" style={{ color: "var(--c)" }}>View traces</Link>
          </div>
          {runs.length === 0 ? <p className="py-6 text-sm text-muted">No runs yet. Launch one from Investigations.</p> : (
            <ul className="divide-y divide-line">
              {runs.map((r) => (
                <li key={r.thread_id} className="flex items-center justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-heading">{r.query}</p>
                    <p className="font-mono text-[11px] text-muted">{r.thread_id} · {r.route}</p>
                  </div>
                  <Badge kind={r.status === "done" ? "ok" : "warn"}>{r.status === "done" ? "done" : "awaiting approval"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card tone="evals" className="lg:col-span-2">
          <h2 className="mb-4 font-display text-lg font-semibold text-heading">Quality at a glance</h2>
          <div className="flex flex-wrap items-center justify-around gap-4">
            <Ring value={base?.correctness ?? 0} label="correct" />
            <div data-tone="mission"><Ring value={base?.hit ?? 0} label="hit@5" /></div>
            <div data-tone="investigate"><Ring value={agent?.tools ?? 0} label="tool acc." /></div>
          </div>
          {pending.length > 0 && (
            <div className="mt-6 space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted">Awaiting the Director</p>
              {pending.map((x) => <p key={x.p} className="text-sm text-text"><span className="font-mono text-warn">{x.mission}</span> · {x.p}</p>)}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {[{ href: "/assistant", t: "assistant", i: Bot, h: "Ask a question", s: "One-step cited answers" },
          { href: "/retrieval", t: "retrieval", i: Boxes, h: "Compare retrieval", s: "Dense · BM25 · hybrid · rerank" },
          { href: "/learn", t: "learn", i: Radar, h: "How it works", s: "7 modules, basics → production" }].map((q) => (
          <Link key={q.href} href={q.href}>
            <Card tone={q.t} hover className="flex items-center gap-4">
              <span className="chip-icon grid h-11 w-11 place-items-center rounded-tl-xl rounded-br-xl"><q.i size={19} /></span>
              <div><p className="font-semibold text-heading">{q.h}</p><p className="text-sm text-muted">{q.s}</p></div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
