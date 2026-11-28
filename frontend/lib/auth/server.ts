import { createNeonAuth } from "@neon/auth/next/server";

// Null when Neon Auth isn't configured (local dev without a branch, CI builds): the backend then keys users by IP.
export const auth =
  process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET
    ? createNeonAuth({ baseUrl: process.env.NEON_AUTH_BASE_URL, cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET } })
    : null;
