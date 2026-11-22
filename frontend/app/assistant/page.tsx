"use client";
import { useState } from "react";
import { Bot, Clock, Coins, CornerDownLeft, FileText, Send, Sparkles } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { post } from "@/lib/api";
import { usePrefill } from "@/lib/prefill";

const MODES = ["dense", "bm25", "hybrid", "hybrid_rerank", "multi_query"];
const SAMPLES = ["What should the crew do on error E-217?", "What is the current max drilling depth of the RD-440 in very cold ice?",
  "Who is currently commanding the Meridian mission?", "What is the budget of ODY-05 Deepwater?"];

type Turn = { q: string; r?: any; err?: string };

export default function Assistant() {
  const [q, setQ] = useState("");
  usePrefill(setQ);
  const [mode, setMode] = useState("hybrid_rerank");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);

  async function ask(question = q) {
    if (!question.trim() || busy) return;
    setBusy(true); setQ("");
    const idx = turns.length;
    setTurns((t) => [...t, { q: question }]); setSel(idx);
    try {
      const r = await post("/ask", { question, mode, k: 5 });
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, r } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, err: String(e) } : x)));
    } finally { setBusy(false); }
  }
  const cur = turns[sel]?.r;

  return (
    <div data-tone="assistant">
      <PageHeader tone="assistant" icon={Bot} eyebrow="Module 1 · RAG" title="Mission Assistant">
        <div className="flex flex-wrap gap-1 rounded-tl-xl rounded-br-xl border border-line bg-surface p-1">
          {MODES.map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`min-h-9 rounded-tl-lg rounded-br-lg px-3 font-mono text-xs transition-colors duration-150 ${mode === m ? "btn-primary" : "text-muted hover:text-heading"}`}>{m}</button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="flex min-h-[560px] flex-col lg:col-span-3">
          <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto pr-1">
            {turns.length === 0 && (
              <div className="space-y-4 py-6">
                <Empty icon={Sparkles}>Ask anything about HED planets, missions, crew or equipment.<br />Answers cite their source documents and refuse when the docs don&apos;t say.</Empty>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SAMPLES.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-tl-xl rounded-br-xl border border-line px-3 py-2.5 text-left text-sm text-muted transition-colors hover:border-[var(--c)] hover:text-heading">{s}</button>)}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className="reveal space-y-3">
                <div className="flex justify-end"><p className="max-w-[85%] rounded-tl-2xl rounded-br-2xl bg-surface-2 px-4 py-2.5 text-sm text-heading">{t.q}</p></div>
                <button onClick={() => setSel(i)} className={`block w-full rounded-tl-2xl rounded-br-2xl border p-4 text-left transition-colors ${sel === i ? "border-[color-mix(in_srgb,var(--c)_50%,transparent)] bg-[var(--accent-soft)]" : "border-line"}`}>
                  {t.err ? <ErrorNote error={t.err} /> : !t.r ? <Spinner label="Retrieving and answering" /> : (
                    <>
                      <p className="text-sm leading-relaxed text-text">{t.r.answer}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {!t.r.answerable && <Badge kind="warn">not in documents</Badge>}
                        {t.r.citations.map((c: string) => <Badge key={c}><FileText size={11} />{c}</Badge>)}
                        {t.r.bad_citations?.length > 0 && <Badge kind="danger">invalid: {t.r.bad_citations.join(", ")}</Badge>}
                        {t.r.flags?.map((f: string) => <Badge key={f} kind="danger">{f}</Badge>)}
                        <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted">
                          <span className="flex items-center gap-1"><Clock size={11} />{t.r.llm.ms}ms</span>
                          <span>{t.r.llm.in + t.r.llm.out} tok</span>
                          <span className="flex items-center gap-1"><Coins size={11} />${t.r.llm.cost.toFixed(5)}</span>
                        </span>
                      </div>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="mt-4 flex gap-2 border-t border-line pt-4">
            <label htmlFor="q" className="sr-only">Question</label>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask mission control…"
              className="min-h-11 flex-1 rounded-tl-xl rounded-br-xl border border-line bg-bg px-4 text-sm text-heading outline-none placeholder:text-muted focus:border-[var(--c)]" />
            <Button disabled={busy || !q.trim()} aria-label="Send"><Send size={16} /><span className="hidden sm:inline">Send</span></Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-heading">Retrieved evidence</h2>
            {cur && <span className="font-mono text-[11px] text-muted">{cur.chunks.length} chunks · {mode}</span>}
          </div>
          {!cur ? <Empty icon={CornerDownLeft}>Chunks, scores and metadata for the selected answer appear here.</Empty> : (
            <ol className="space-y-3">
              {cur.chunks.map((c: any, i: number) => {
                const cited = cur.citations.includes(c.doc_id);
                return (
                  <li key={i} className={`reveal rounded-tl-xl rounded-br-xl border p-3 ${cited ? "border-[color-mix(in_srgb,var(--c)_45%,transparent)]" : "border-line"}`} style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted">#{i + 1}</span>
                      <Badge kind={cited ? undefined : "muted"}>{c.doc_id}</Badge>
                      {c.status === "superseded" && <Badge kind="warn">superseded</Badge>}
                      <span className="ml-auto font-mono text-xs text-heading">{c.score.toFixed(3)}</span>
                    </div>
                    <p className="text-[11px] text-muted">{c.heading} · {c.type}{c.planet ? ` · ${c.planet}` : ""}</p>
                    <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-text/80">{c.text.split("\n").slice(1).join(" ")}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
