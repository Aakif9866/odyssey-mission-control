"""Observability in one place: commit SHA, request context, PII redaction, LangSmith wiring, telemetry writes."""
import logging, os, re, subprocess, time
from contextvars import ContextVar
from app import db

log = logging.getLogger("obs")


def _git_sha() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=2).stdout.strip()
    except Exception:
        return ""


COMMIT = os.getenv("VERCEL_GIT_COMMIT_SHA", "")[:7] or _git_sha() or "dev"
request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id: ContextVar[str] = ContextVar("user_id", default="anon")
llm_budget: ContextVar[list | None] = ContextVar("llm_budget", default=None)  # [calls_so_far] for the current request

# ponytail: regex PII redaction (emails, cards, phones, IPs, keys); swap for Presidio if real user PII shows up
_PII = [(re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "<EMAIL>"),
        (re.compile(r"\b(?:sk|gsk|lsv2|pk|ghp)_[A-Za-z0-9_-]{12,}"), "<KEY>"),
        (re.compile(r"\b(?:\d[ -]?){13,16}\b"), "<CARD>"),
        (re.compile(r"(?<![\w.])\+?\d{1,3}[ .-]?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b"), "<PHONE>"),
        (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "<IP>")]


def redact(x):
    if isinstance(x, str):
        for pat, sub in _PII:
            x = pat.sub(sub, x)
        return x
    if isinstance(x, dict):
        return {k: redact(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [redact(v) for v in x]
    return x


if os.getenv("LANGSMITH_API_KEY") and os.getenv("LANGSMITH_TRACING", "").lower() == "true":
    import langsmith as ls
    # Global client: used by @traceable/wrap_openai AND LangGraph's LangChain tracer. Redaction runs before anything leaves the process.
    ls.configure(client=ls.Client(hide_inputs=redact, hide_outputs=redact), metadata={"commit": COMMIT})
    TRACING = True
else:
    TRACING = False


def trace_meta() -> dict:
    return {"commit": COMMIT, "request_id": request_id.get(), "user_id": user_id.get()}


def record_call(rec: dict):
    """Persist one LLM call (or failure) for the current API request. Telemetry must never break a request."""
    if not request_id.get():
        return  # evals/CLI: CALLS in memory is enough
    try:
        db.q("insert into llm_calls values (?,?,?,?,?,?,?,?,?,?)",
             (request_id.get(), rec.get("ts", time.time()), user_id.get(), rec.get("tag"), rec.get("model"), rec.get("ms", 0),
              rec.get("in", 0), rec.get("out", 0), rec.get("cost", 0.0), rec.get("error")))
    except Exception as e:
        log.warning("telemetry write failed: %s", e)


def record_request(rid: str, path: str, status: int, ms: int):
    try:
        db.q("insert into requests values (?,?,?,?,?,?,?)", (rid, time.time(), user_id.get(), path, status, ms, COMMIT))
    except Exception as e:
        log.warning("telemetry write failed: %s", e)


if __name__ == "__main__":
    s = redact({"q": "mail jane.doe@x.io or +1 415-555-0134 from 10.0.0.12, card 4111 1111 1111 1111, key gsk_abcdefghijklmnop",
                "keep": "E-217 at 0.37 Hz, 2241-01-08, ODY-03, 5.4 Sv/year, 4.2 billion"})
    assert "<EMAIL>" in s["q"] and "<PHONE>" in s["q"] and "<IP>" in s["q"] and "<CARD>" in s["q"] and "<KEY>" in s["q"], s
    assert s["keep"] == "E-217 at 0.37 Hz, 2241-01-08, ODY-03, 5.4 Sv/year, 4.2 billion", s
    print("redact ok", s)
