"""Email alerts on error-rate / latency / fallback spikes, computed from the telemetry tables.
  uv run python -m app.alerts --test     # send a test email (checks SMTP settings)
Cooldown is stored in the DB, so several API instances don't all send the same alert."""
import logging, os, smtplib, sys, time
from email.message import EmailMessage
from app import db, obs

log = logging.getLogger("alerts")
WINDOW_S, MIN_REQUESTS, COOLDOWN_S = 300, 5, 1800
MAX_ERROR_RATE, MAX_P95_MS, MAX_FALLBACK_RATE = 0.2, 15_000, 0.5


def send(subject: str, body: str) -> bool:
    host, to = os.getenv("SMTP_HOST"), os.getenv("ALERT_EMAIL_TO")
    if not (host and to):
        log.warning("ALERT (email not configured): %s", subject)
        return False
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = f"[Odyssey] {subject}", os.getenv("SMTP_USER", to), to
    msg.set_content(body)
    with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", 587)), timeout=10) as s:
        s.starttls()
        if os.getenv("SMTP_USER"):
            s.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD", ""))
        s.send_message(msg)
    return True


def evaluate(since: float) -> list[tuple[str, str]]:
    """Returns [(kind, detail)] for every threshold breached in the window."""
    reqs = db.q("select status, ms from requests where ts>?", (since,))
    if len(reqs) < MIN_REQUESTS:
        return []
    out = []
    err = sum(s >= 500 for s, _ in reqs) / len(reqs)
    if err > MAX_ERROR_RATE:
        out.append(("error_rate", f"error rate {err:.0%} over {len(reqs)} requests (threshold {MAX_ERROR_RATE:.0%})"))
    ms = sorted(m for _, m in reqs)
    p95 = ms[min(len(ms) - 1, int(len(ms) * 0.95))]
    if p95 > MAX_P95_MS:
        out.append(("latency", f"p95 latency {p95} ms over {len(reqs)} requests (threshold {MAX_P95_MS} ms)"))
    tags = [t or "" for (t,) in db.q("select tag from llm_calls where ts>? and error is null", (since,))]
    if tags and (fb := sum("fallback" in t for t in tags) / len(tags)) > MAX_FALLBACK_RATE:
        out.append(("fallback", f"{fb:.0%} of LLM calls fell back to the judge provider (primary provider failing?)"))
    return out


def check():
    """Called after every LLM request (background thread). Never raises."""
    try:
        now = time.time()
        for kind, detail in evaluate(now - WINDOW_S):
            if db.q("select 1 from alerts where kind=? and ts>?", (kind, now - COOLDOWN_S)):
                continue
            db.q("insert into alerts values (?,?,?)", (kind, now, detail))  # claim first: concurrent checks won't double-send
            if send(f"{kind} alert", f"{detail}\n\nwindow: last {WINDOW_S // 60} min\ncommit: {obs.COMMIT}\ndashboard: /telemetry\n"):
                log.warning("alert emailed: %s", detail)
    except Exception as e:
        log.warning("alert check failed: %s", e)


if __name__ == "__main__":
    if "--test" in sys.argv:
        print("sent" if send("test alert", f"SMTP works. commit {obs.COMMIT}") else "SMTP_HOST / ALERT_EMAIL_TO not set")
