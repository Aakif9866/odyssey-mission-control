"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, BookOpen, Bot, Database, FileText, FlaskConical, GitBranch, Gauge, Menu, Orbit, Radar, Search, X,
} from "lucide-react";

export const NAV: { href: string; label: string; icon: LucideIcon; tone: string; group: string }[] = [
  { href: "/", label: "Mission Control", icon: Orbit, tone: "mission", group: "Operate" },
  { href: "/assistant", label: "Assistant", icon: Bot, tone: "assistant", group: "Operate" },
  { href: "/investigate", label: "Investigations", icon: Radar, tone: "investigate", group: "Operate" },
  { href: "/documents", label: "Documents", icon: FileText, tone: "docs", group: "Operate" },
  { href: "/retrieval", label: "Retrieval Lab", icon: Search, tone: "retrieval", group: "Engineer" },
  { href: "/evals", label: "Evaluations", icon: FlaskConical, tone: "evals", group: "Engineer" },
  { href: "/graph", label: "Graph & Traces", icon: GitBranch, tone: "graph", group: "Engineer" },
  { href: "/telemetry", label: "Telemetry", icon: Gauge, tone: "telemetry", group: "Engineer" },
  { href: "/learn", label: "Learn", icon: BookOpen, tone: "learn", group: "Lab" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const groups = [...new Set(NAV.map((n) => n.group))];
  const nav = (
    <nav className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted/70">{g}</p>
          <ul className="space-y-1">
            {NAV.filter((n) => n.group === g).map((n) => (
              <li key={n.href} data-tone={n.tone}>
                <Link href={n.href} onClick={() => setOpen(false)}
                  className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 ${active(n.href) ? "bg-[var(--accent-soft)] text-heading" : "text-muted hover:bg-white/[0.04] hover:text-heading"}`}>
                  {active(n.href) && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: "var(--gb)" }} />}
                  <n.icon size={17} style={{ color: "var(--c)" }} />
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
  const brand = (
    <Link href="/" className="flex items-center gap-3" data-tone="investigate">
      <span className="chip-icon grid h-9 w-9 place-items-center rounded-tl-xl rounded-br-xl"><Orbit size={18} /></span>
      <span>
        <span className="block font-display text-lg font-bold tracking-wide text-heading">ODYSSEY</span>
        <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Mission Control · HED</span>
      </span>
    </Link>
  );
  return (
    <div className="min-h-screen">
      <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg,#22d3ee,#818cf8,#c084fc,#f472b6)" }} />
      <aside className="fixed inset-y-0 left-0 top-[3px] hidden w-[264px] flex-col gap-8 border-r border-line bg-bg/80 px-4 py-6 backdrop-blur lg:flex">
        {brand}
        {nav}
        <div className="mt-auto rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-[11px] text-muted">
          <span className="pulse-dot mr-2 inline-block h-2 w-2 rounded-full bg-ok" />Groq · DeepSeek · Qdrant
        </div>
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/85 px-4 py-3 backdrop-blur lg:hidden">
        {brand}
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="grid h-11 w-11 place-items-center rounded-lg border border-line"><Menu size={18} /></button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-[280px] border-r border-line bg-surface px-4 py-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-8 flex items-center justify-between">{brand}<button aria-label="Close menu" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center"><X size={18} /></button></div>
            {nav}
          </div>
        </div>
      )}
      <main className="lg:pl-[264px]">
        <div className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ tone, icon: Icon, eyebrow, title, children }: { tone: string; icon: LucideIcon; eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div data-tone={tone} className="reveal mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="chip-icon grid h-12 w-12 shrink-0 place-items-center rounded-tl-2xl rounded-br-2xl"><Icon size={22} /></span>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--c)" }}>{eyebrow}</p>
          <h1 className="font-display text-2xl font-bold text-heading lg:text-4xl">{title}</h1>
        </div>
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className = "", strip = false, hover = false, tone, style }: { children: ReactNode; className?: string; strip?: boolean; hover?: boolean; tone?: string; style?: React.CSSProperties }) {
  return <div data-tone={tone} style={style} className={`card ${strip ? "card-strip" : ""} ${hover ? "card-hover" : ""} p-5 lg:p-6 ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub, icon: Icon, tone, i = 0 }: { label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; tone: string; i?: number }) {
  return (
    <Card tone={tone} strip hover className="reveal" style={{ animationDelay: `${i * 60}ms` }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold text-heading">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
        </div>
        <span className="chip-icon grid h-10 w-10 place-items-center rounded-tl-xl rounded-br-xl"><Icon size={18} /></span>
      </div>
    </Card>
  );
}

export function Badge({ children, tone, kind }: { children: ReactNode; tone?: string; kind?: "ok" | "warn" | "danger" | "muted" }) {
  const color = kind === "ok" ? "var(--ok)" : kind === "warn" ? "var(--warn)" : kind === "danger" ? "var(--danger)" : kind === "muted" ? "var(--muted)" : "var(--c)";
  return (
    <span data-tone={tone} className="inline-flex items-center gap-1 rounded-tl-md rounded-br-md border px-2 py-0.5 font-mono text-[11px]"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
      {children}
    </span>
  );
}

export function Button({ children, variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" }) {
  const v = variant === "primary" ? "btn-primary" : variant === "outline" ? "btn-outline" : "text-muted hover:text-heading hover:bg-white/5";
  return <button {...p} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-tl-xl rounded-br-xl px-4 text-sm font-medium transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}>{children}</button>;
}

export function Meter({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      {label && <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{label}</span><span className="font-mono text-heading">{Math.round(value * 100)}%</span></div>}
      <div className="meter"><span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>
    </div>
  );
}

export function Ring({ value, size = 88, label }: { value: number; size?: number; label?: string }) {
  return (
    <div className="progress-ring grid place-items-center" style={{ width: size, height: size, ["--p" as any]: Math.round(value * 100) }}>
      <div className="grid place-items-center rounded-full bg-surface" style={{ width: size - 14, height: size - 14 }}>
        <span className="font-display text-lg font-bold text-heading">{Math.round(value * 100)}%</span>
        {label && <span className="-mt-1 text-[10px] text-muted">{label}</span>}
      </div>
    </div>
  );
}

export function Spinner({ label = "Working" }: { label?: string }) {
  return <span className="inline-flex items-center gap-2 text-sm text-muted"><Activity size={15} className="pulse-dot" style={{ color: "var(--c)" }} />{label}…</span>;
}

export function Empty({ icon: Icon = Database, children }: { icon?: LucideIcon; children: ReactNode }) {
  return <div className="grid place-items-center gap-3 py-12 text-center text-sm text-muted"><Icon size={28} style={{ color: "var(--c)" }} />{children}</div>;
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">⚠ {error.includes("fetch") ? "Backend unreachable. Start it: cd backend && uv run uvicorn app.api:app --port 8000" : error}</p>;
}
