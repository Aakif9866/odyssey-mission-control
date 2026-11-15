"use client";
import { useEffect, useMemo, useState } from "react";
import { FileText, Layers, Upload } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

const TYPE_TONE: Record<string, string> = { planet_profile: "mission", mission_brief: "investigate", crew_roster: "assistant", mission_log: "graph",
  science_report: "evals", equipment_manual: "retrieval", history: "learn" };

export default function Documents() {
  const [docs, setDocs] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [tab, setTab] = useState<"chunks" | "source">("chunks");
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const load = () => api("/documents").then(setDocs).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);
  const open = (s: string) => api(`/documents/${encodeURIComponent(s)}`).then(setSel).catch((e) => setErr(String(e)));
  const groups = useMemo(() => docs.reduce((a: Record<string, any[]>, d) => ((a[d.type ?? "other"] ??= []).push(d), a), {}), [docs]);

  async function upload(f: File) {
    setUploading(true);
    const fd = new FormData(); fd.append("file", f);
    try { const r = await api("/ingest", { method: "POST", body: fd }); await load(); open(r.source); }
    catch (e) { setErr(String(e)); } finally { setUploading(false); }
  }

  return (
    <div data-tone="docs">
      <PageHeader tone="docs" icon={FileText} eyebrow="Knowledge base" title="Mission Documents">
        <label className="btn-primary inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-tl-xl rounded-br-xl px-4 text-sm font-medium transition-transform active:scale-95">
          <Upload size={16} />{uploading ? "Ingesting…" : "Upload .md"}
          <input type="file" accept=".md" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </PageHeader>
      <ErrorNote error={err} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          {Object.entries(groups).map(([type, ds]) => (
            <Card key={type} tone={TYPE_TONE[type] ?? "docs"} strip className="reveal">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--c)" }}>{type.replace("_", " ")}</p>
              <ul className="space-y-1">
                {(ds as any[]).map((d) => (
                  <li key={d.source}>
                    <button onClick={() => open(d.source)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${sel?.source === d.source ? "bg-[var(--accent-soft)] text-heading" : "text-text hover:bg-white/[0.04]"}`}>
                      <span className="truncate">{d.title}</span>
                      <span className="flex shrink-0 gap-1">
                        {d.status === "superseded" && <Badge kind="warn">superseded</Badge>}
                        {d.uploaded && <Badge kind="ok">uploaded</Badge>}
                        <Badge kind="muted">{d.doc_id ?? "?"}</Badge>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {docs.length === 0 && !err && <Spinner label="Loading documents" />}
        </div>
        <Card className="lg:col-span-3">
          {!sel ? <Empty icon={Layers}>Select a document to see how it was chunked and what metadata each chunk carries into Qdrant.</Empty> : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-heading">{sel.source}</h2>
                <div className="flex gap-1 rounded-tl-lg rounded-br-lg border border-line p-1">
                  {(["chunks", "source"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`min-h-9 rounded-md px-3 text-xs ${tab === t ? "btn-primary" : "text-muted"}`}>{t === "chunks" ? `${sel.chunks.length} chunks` : "source"}</button>)}
                </div>
              </div>
              {tab === "source" ? <pre className="scrollbar-thin max-h-[640px] overflow-auto whitespace-pre-wrap rounded-tl-xl rounded-br-xl bg-bg p-4 font-mono text-xs text-text/85">{sel.content}</pre> : (
                <ol className="space-y-3">
                  {sel.chunks.map((c: any) => (
                    <li key={c.chunk} className="reveal rounded-tl-xl rounded-br-xl border border-line p-4" style={{ animationDelay: `${c.chunk * 40}ms` }}>
                      <div className="mb-2 flex items-center gap-2"><Badge>chunk {c.chunk}</Badge><span className="text-xs text-muted">{c.heading}</span><span className="ml-auto font-mono text-[10px] text-muted">{c.text.length} chars</span></div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-text/85"><span style={{ color: "var(--c)" }}>{c.text.split("\n")[0]}</span>{"\n"}{c.text.split("\n").slice(1).join("\n")}</p>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
