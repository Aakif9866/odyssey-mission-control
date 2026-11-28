"use client";
import { createAuthClient } from "@neon/auth/next";

export const AUTH = process.env.NEXT_PUBLIC_AUTH === "1";
export const authClient = createAuthClient();

// Neon Auth JWTs live 15 min; reuse one for 10 so every API call doesn't hit /api/auth/token.
let cached: { t: string; exp: number } | null = null;

export async function authToken(): Promise<string | null> {
  if (!AUTH) return null;
  if (cached && cached.exp > Date.now()) return cached.t;
  try {
    const { data } = await authClient.token();
    cached = data?.token ? { t: data.token, exp: Date.now() + 10 * 60_000 } : null;
  } catch {
    cached = null;
  }
  return cached?.t ?? null;
}

export const clearToken = () => { cached = null; };
