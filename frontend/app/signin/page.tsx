"use client";
import { useEffect, useState } from "react";
import { LogIn, LogOut, UserPlus, UserRound } from "lucide-react";
import { Button, Card, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { AUTH, authClient, clearToken } from "@/lib/auth/client";

type User = { email: string; name?: string } | null;

export default function SignIn() {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => authClient.getSession().then(({ data }) => setUser((data?.user as User) ?? null)).catch(() => setUser(null));
  useEffect(() => { if (AUTH) refresh(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = mode === "in"
      ? await authClient.signIn.email({ email: form.email, password: form.password })
      : await authClient.signUp.email({ email: form.email, password: form.password, name: form.name || form.email.split("@")[0] });
    setBusy(false);
    if (error) return setErr(error.message ?? (mode === "in" ? "Invalid email or password" : "Sign-up failed"));
    clearToken(); refresh();
  }

  const field = "min-h-11 w-full rounded-tl-xl rounded-br-xl border border-line bg-bg px-4 text-sm text-heading outline-none placeholder:text-muted focus:border-[var(--c)]";

  return (
    <div data-tone="assistant">
      <PageHeader tone="assistant" icon={UserRound} eyebrow="v2 · Neon Auth" title="Account" />
      <Card className="mx-auto max-w-md">
        {!AUTH ? <Empty icon={UserRound}>Auth is not configured on this deployment (NEXT_PUBLIC_AUTH unset). The API keys rate limits by IP.</Empty>
          : user === undefined ? <Spinner label="Checking session" />
          : user ? (
            <div className="space-y-4">
              <p className="text-sm text-text">Signed in as <span className="font-mono text-heading">{user.email}</span></p>
              <p className="text-xs text-muted">Your requests count toward a per-user rate limit and daily token budget.</p>
              <Button variant="outline" onClick={async () => { await authClient.signOut(); clearToken(); setUser(null); }}><LogOut size={15} />Sign out</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <p className="text-sm text-muted">Sign in to ask questions and run investigations. Docs, evals and telemetry stay public.</p>
              {mode === "up" && <><label htmlFor="name" className="sr-only">Name</label><input id="name" className={field} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></>}
              <label htmlFor="email" className="sr-only">Email</label>
              <input id="email" type="email" required autoComplete="email" className={field} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <label htmlFor="password" className="sr-only">Password</label>
              <input id="password" type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} className={field} placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <ErrorNote error={err} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy}>{mode === "in" ? <><LogIn size={15} />Sign in</> : <><UserPlus size={15} />Create account</>}</Button>
                <Button type="button" variant="outline" onClick={() => authClient.signIn.social({ provider: "google", callbackURL: window.location.origin + "/signin" })}>Continue with Google</Button>
                <Button type="button" variant="ghost" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }}>{mode === "in" ? "Create an account" : "I have an account"}</Button>
              </div>
            </form>
          )}
      </Card>
    </div>
  );
}
