"""App state (runs, request/LLM telemetry, alerts, feedback). Postgres (Neon) if DATABASE_URL is set, else SQLite.
SQL is written once in the common subset (ON CONFLICT upserts, `?` placeholders translated for psycopg)."""
import os, sqlite3, threading
from app.config import STATE

URL = os.getenv("DATABASE_URL")
SCHEMA = [
    "create table if not exists runs (thread_id text primary key, query text, status text, route text, ts double precision, result text)",
    "create table if not exists requests (id text primary key, ts double precision, user_id text, path text, status integer, ms integer, commit_sha text)",
    "create table if not exists llm_calls (request_id text, ts double precision, user_id text, tag text, model text, ms integer, "
    "tokens_in integer, tokens_out integer, cost double precision, error text)",
    "create table if not exists alerts (kind text, ts double precision, detail text)",
    "create table if not exists feedback (id text primary key, ts double precision, user_id text, ref_id text, rating text, "
    "question text, answer text, comment text)",
    "create index if not exists requests_user_ts on requests (user_id, ts)",
    "create index if not exists llm_calls_user_ts on llm_calls (user_id, ts)",
]

if URL:
    from psycopg_pool import ConnectionPool
    _pool = ConnectionPool(URL, min_size=1, max_size=4, kwargs={"autocommit": True}, check=ConnectionPool.check_connection, open=True)
else:
    _conn = sqlite3.connect(os.getenv("ODYSSEY_DB", STATE / "runs.sqlite"), check_same_thread=False, isolation_level=None)
    _lock = threading.Lock()  # ponytail: one SQLite connection behind a lock; fine for one process, Postgres for real traffic


def q(sql: str, params: tuple = ()) -> list[tuple]:
    if URL:
        with _pool.connection() as c:
            cur = c.execute(sql.replace("?", "%s"), params)
            return cur.fetchall() if cur.description else []
    with _lock:
        cur = _conn.execute(sql, params)
        return cur.fetchall() if cur.description else []


for _s in SCHEMA:
    q(_s)
