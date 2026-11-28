import { auth } from "@/lib/auth/server";

// Same-origin proxy to Neon Auth (vercel.json routes /api/auth/* here, everything else under /api to FastAPI).
const off = () => Response.json({ error: "auth not configured" }, { status: 404 });
const h = auth?.handler();
export const GET = h?.GET ?? off;
export const POST = h?.POST ?? off;
export const PUT = h?.PUT ?? off;
export const DELETE = h?.DELETE ?? off;
export const PATCH = h?.PATCH ?? off;
