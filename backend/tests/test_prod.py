"""v2 production hardening: redaction, limits, run budget, alerts, JWT verification. Deterministic, no network."""
import time
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import HTTPException
from app import alerts, auth, db, llm, obs
from app.config import DAILY_TOKENS, MAX_LLM_CALLS, RATE_PER_MIN


def test_redact_pii_keeps_mission_data():
    s = obs.redact({"q": ["ping jane@x.io / +1 415-555-0134"], "k": "E-217 at 0.37 Hz on 2241-01-08"})
    assert s == {"q": ["ping <EMAIL> / <PHONE>"], "k": "E-217 at 0.37 Hz on 2241-01-08"}


def test_rate_limit_and_token_budget():
    obs.user_id.set("user:rl")
    auth.limits()  # fresh user passes
    for i in range(RATE_PER_MIN):
        db.q("insert into requests values (?,?,?,?,?,?,?)", (f"rl{i}", time.time(), "user:rl", "/ask", 200, 10, "t"))
    with pytest.raises(HTTPException) as e:
        auth.limits()
    assert e.value.status_code == 429
    obs.user_id.set("user:tok")
    db.q("insert into llm_calls values (?,?,?,?,?,?,?,?,?,?)", ("x", time.time(), "user:tok", "rag", "m", 1, DAILY_TOKENS, 0, 0.0, None))
    with pytest.raises(HTTPException, match="budget"):
        auth.limits()


def test_max_llm_calls_per_run():
    obs.llm_budget.set([MAX_LLM_CALLS - 1])
    llm._spend()
    with pytest.raises(llm.BudgetExceeded):
        llm._spend()
    obs.llm_budget.set(None)


def test_alert_fires_once_per_cooldown(monkeypatch):
    sent = []
    monkeypatch.setattr(alerts, "send", lambda subj, body: sent.append(subj) or True)
    for i in range(6):
        db.q("insert into requests values (?,?,?,?,?,?,?)", (f"al{i}", time.time(), "user:al", "/ask", 500, 100, "t"))
    alerts.check()
    alerts.check()
    assert sent == ["error_rate alert"]


def test_jwt_verify(monkeypatch):
    key = Ed25519PrivateKey.generate()
    monkeypatch.setattr(auth, "_jwks", type("J", (), {"get_signing_key_from_jwt": lambda self, t: type("K", (), {"key": key.public_key()})()})())
    monkeypatch.setattr(auth, "ISSUER", "https://auth.example")
    good = jwt.encode({"sub": "u1", "iss": "https://auth.example", "exp": time.time() + 60}, key, algorithm="EdDSA")
    assert auth.verify(good) == "u1"
    for bad in ({"sub": "u1", "iss": "https://evil", "exp": time.time() + 60}, {"sub": "u1", "iss": "https://auth.example", "exp": time.time() - 5}):
        with pytest.raises(jwt.PyJWTError):
            auth.verify(jwt.encode(bad, key, algorithm="EdDSA"))
