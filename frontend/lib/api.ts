import { authToken } from "@/lib/auth/client";

export const API = process.env.NEXT_PUBLIC_API ?? "http://localhost:8000";

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = await authToken();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (init?.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API}${path}`, { ...init, headers, cache: "no-store" });
  if (r.status === 401) throw new Error("401: sign in required (Account page)");
  if (r.status === 429) throw new Error(`429: ${(await r.json().catch(() => ({}))).detail ?? "rate limited"}`);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

/** EventSource can't send headers: the backend also accepts the JWT as ?token=. */
export async function streamUrl(path: string, params: Record<string, string>) {
  const token = await authToken();
  return `${API}${path}?${new URLSearchParams(token ? { ...params, token } : params)}`;
}

export const post = <T = any>(path: string, body: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const pct = (x?: number | null) => (x == null ? "–" : `${Math.round(x * 1000) / 10}%`);
