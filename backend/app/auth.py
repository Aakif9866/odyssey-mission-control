"""Access control: Neon Auth (Managed Better Auth) JWT verification for FastAPI.
The frontend signs users in and sends `Authorization: Bearer <jwt>` (EdDSA, 15 min); SSE passes it as `?token=` because
EventSource can't set headers. Off when NEON_AUTH_JWKS_URL is unset (local dev, CI, evals): users are keyed by IP."""
import os, time
from urllib.parse import urlparse
import jwt
from fastapi import HTTPException, Request
from app import db, obs
from app.config import DAILY_TOKENS, RATE_PER_MIN

JWKS_URL = os.getenv("NEON_AUTH_JWKS_URL")
_u = urlparse(os.getenv("NEON_AUTH_BASE_URL", ""))
ISSUER = f"{_u.scheme}://{_u.netloc}" if _u.netloc else None
_jwks = jwt.PyJWKClient(JWKS_URL, cache_keys=True, lifespan=3600) if JWKS_URL else None
ENABLED = _jwks is not None


def _token(req: Request) -> str | None:
    h = req.headers.get("authorization", "")
    return h[7:] if h.lower().startswith("bearer ") else req.query_params.get("token")


def verify(token: str) -> str:
    """Returns the user id (JWT `sub`); raises jwt.PyJWTError if the token is invalid/expired."""
    claims = jwt.decode(token, _jwks.get_signing_key_from_jwt(token).key, algorithms=["EdDSA"], issuer=ISSUER,
                        options={"verify_aud": False, "require": ["sub", "exp"]})
    return claims["sub"]


def user_id(req: Request) -> str:
    """'user:<sub>' for a valid token, else 'anon:<ip>'. Never raises: the telemetry middleware calls it on every request."""
    if _jwks and (tok := _token(req)):
        try:
            return "user:" + verify(tok)
        except Exception:
            pass
    ip = (req.headers.get("x-forwarded-for") or (req.client.host if req.client else "?")).split(",")[0].strip()
    return "anon:" + ip


def require_user():
    """Dependency for LLM/feedback endpoints. No-op when auth isn't configured."""
    if ENABLED and not obs.user_id.get().startswith("user:"):
        raise HTTPException(401, "sign in required")


def limits():
    """Per-user rate limit + daily token budget, read from the telemetry tables (no separate store)."""
    uid = obs.user_id.get()
    (n,), = db.q("select count(*) from requests where user_id=? and ts>?", (uid, time.time() - 60))
    if n >= RATE_PER_MIN:
        raise HTTPException(429, f"rate limit: {RATE_PER_MIN} requests/minute")
    day = time.time() - time.time() % 86400
    (tok,), = db.q("select coalesce(sum(tokens_in + tokens_out), 0) from llm_calls where user_id=? and ts>?", (uid, day))
    if tok >= DAILY_TOKENS:
        raise HTTPException(429, f"daily token budget used ({tok}/{DAILY_TOKENS})")
