"""Odyssey API.  uv run uvicorn app.api:app --port 8000"""
import asyncio, contextvars, json, logging, statistics, threading, time, uuid
from pathlib import Path
from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from langgraph.types import Command
from pydantic import BaseModel
from app import agent, alerts, auth, db, llm, obs, tools
from app.chunking import parse_front_matter
from app.config import BACKEND, COLLECTION, CORPUS_DIR, UPLOADS_DIR
from app.graph import GRAPH
from app.ingest import ensure_collection, ingest_dir, ingest_file
from app.rag import answer
from app.retrieve import MODES, search
from app.store import client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
if not client().collection_exists(COLLECTION) or not client().count(COLLECTION).count:
    ingest_dir()  # fresh instance (Vercel cold start): build the index from the corpus (~38 chunks)
app = FastAPI(title="Odyssey Mission Control API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_methods=["*"], allow_headers=["*"])
RESULTS = BACKEND / "evals" / "results"
UPLOADS = UPLOADS_DIR
LLM_PATHS = ("/ask", "/investigate")  # paths that spend LLM tokens: rate-limited, budgeted, measured


@app.middleware("http")
async def telemetry(request: Request, call_next):
    """Per request: id + user in context (LLM calls and traces pick them up), timing, status, alert check."""
    rid = uuid.uuid4().hex[:12]
    obs.request_id.set(rid)
    obs.user_id.set(auth.user_id(request))
    obs.llm_budget.set([0])
    t = time.perf_counter()
    measured = request.url.path.startswith(LLM_PATHS) and request.method != "OPTIONS"  # CORS preflights aren't queries

    def finish(status: int):
        if measured:
            obs.record_request(rid, request.url.path, status, round((time.perf_counter() - t) * 1000))
            threading.Thread(target=alerts.check, daemon=True).start()

    try:
        if obs.TRACING:
            import langsmith as ls
            with ls.tracing_context(metadata=obs.trace_meta()):
                resp = await call_next(request)
        else:
            resp = await call_next(request)
    except Exception:
        finish(500)
        raise
    resp.headers["X-Request-Id"] = rid
    if resp.headers.get("content-type", "").startswith("text/event-stream"):
        body = resp.body_iterator

        async def timed():  # SSE: time the whole stream, not the first byte; graph errors surface as llm_calls.error rows
            try:
                async for chunk in body:
                    yield chunk
            finally:
                finish(resp.status_code)
        resp.body_iterator = timed()
    else:
        finish(resp.status_code)
    return resp


@app.exception_handler(llm.BudgetExceeded)
def budget_exceeded(_, e):
    return JSONResponse({"detail": str(e)}, status_code=429)


GUARDED = [Depends(auth.require_user), Depends(auth.limits)]


def save_run(r: dict):
    db.q("insert into runs values (?,?,?,?,?,?) on conflict (thread_id) do update set "
         "query=excluded.query, status=excluded.status, route=excluded.route, ts=excluded.ts, result=excluded.result",
         (r["thread_id"], r["query"], r["status"], r["route"], time.time(), json.dumps(r, default=str)))


class AskIn(BaseModel):
    question: str
    k: int = 5
    mode: str = tools.RETRIEVAL_MODE


class SearchIn(BaseModel):
    query: str
    k: int = 5
    modes: list[str] = ["dense", "bm25", "hybrid", "hybrid_rerank"]


class InvestigateIn(BaseModel):
    query: str
    fault: str | None = None


class ResumeIn(BaseModel):
    decision: str


@app.get("/health")
def health():
    return {"ok": True, "collection": COLLECTION, "chunks": client().count(COLLECTION).count, "retrieval_mode": tools.RETRIEVAL_MODE}


@app.get("/missions")
def missions():
    return [{"id": k, **v, "crew": tools.CREW.get(k, [])} for k, v in tools.MISSIONS.items()]


@app.get("/documents")
def documents():
    out = []
    for folder in (CORPUS_DIR, UPLOADS):
        for p in sorted(folder.glob("*.md")) if folder.exists() else []:
            meta, body = parse_front_matter(p.read_text())
            out.append({"source": p.name, "title": body.strip().split("\n")[0].lstrip("# "), "uploaded": folder == UPLOADS,
                        **{k: str(v) for k, v in meta.items()}})
    return out


@app.get("/documents/{source}")
def document(source: str):
    p = next((f / source for f in (CORPUS_DIR, UPLOADS) if (f / source).is_file()), None)
    if not p or p.suffix != ".md":
        raise HTTPException(404)
    pts, _ = client().scroll(COLLECTION, scroll_filter={"must": [{"key": "source", "match": {"value": source}}]}, limit=100)
    chunks = sorted(({"chunk": x.payload["chunk"], "heading": x.payload["heading"], "text": x.payload["text"]} for x in pts), key=lambda c: c["chunk"])
    return {"source": source, "content": p.read_text(), "chunks": chunks}


@app.post("/ingest", dependencies=GUARDED)
async def ingest(file: UploadFile):
    if not file.filename.endswith(".md"):
        raise HTTPException(400, "only .md files (with optional YAML front matter)")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    dest = UPLOADS / Path(file.filename).name
    dest.write_bytes(await file.read())
    ensure_collection()
    return {"source": dest.name, "chunks": ingest_file(dest)}


@app.post("/ask", dependencies=GUARDED)
def ask(body: AskIn):
    if body.mode not in MODES:
        raise HTTPException(400, f"mode must be one of {MODES}")
    return answer(body.question, k=body.k, mode=body.mode) | {"request_id": obs.request_id.get()}


@app.post("/search")
def search_compare(body: SearchIn):
    out = {}
    for m in body.modes:
        t = time.perf_counter()
        hits = search(body.query, k=body.k, mode=m)
        out[m] = {"ms": round((time.perf_counter() - t) * 1000), "hits": hits}
    return out


@app.post("/investigate", dependencies=GUARDED)
def investigate(body: InvestigateIn):
    r = agent.start(body.query, fault=body.fault)
    save_run(r)
    return r


@app.post("/investigate/{thread_id}/resume", dependencies=GUARDED)
def investigate_resume(thread_id: str, body: ResumeIn):
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be approved|rejected")
    r = agent.resume(thread_id, body.decision)
    save_run(r)
    return r


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@app.get("/investigate/stream", dependencies=GUARDED)
async def investigate_stream(query: str, thread_id: str | None = None, decision: str | None = None):
    """Server-Sent Events: one event per graph node as it finishes, then a final 'done' event."""
    thread_id = thread_id or uuid.uuid4().hex[:12]
    cfg = {"configurable": {"thread_id": thread_id}, "recursion_limit": 40, "metadata": obs.trace_meta()}
    inp = Command(resume=decision) if decision else {"query": query, "steps": 0}

    async def gen():
        yield _sse("start", {"thread_id": thread_id})
        q: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def work():  # graph nodes are sync (blocking HTTP); run in a thread, push updates to the queue
            try:
                for upd in GRAPH.stream(inp, cfg, stream_mode="updates"):
                    loop.call_soon_threadsafe(q.put_nowait, ("update", upd))
            except Exception as e:
                loop.call_soon_threadsafe(q.put_nowait, ("error", str(e)))
            loop.call_soon_threadsafe(q.put_nowait, ("end", None))

        loop.run_in_executor(None, contextvars.copy_context().run, work)  # keep request id, user, budget, trace context
        while (item := await q.get())[0] != "end":
            kind, upd = item
            if kind == "error":
                yield _sse("error", {"message": upd})
                continue
            for node, val in upd.items():
                if node == "__interrupt__":
                    yield _sse("interrupt", val[0].value)
                elif isinstance(val, dict):
                    yield _sse("node", {"node": node, "trace": val.get("trace"), "tool_calls": val.get("tool_calls"),
                                        "route": val.get("route"), "flags": val.get("flags")})
        r = agent._result(thread_id, {"__interrupt__": GRAPH.get_state(cfg).interrupts or None})
        save_run(r)
        yield _sse("done", r)

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/runs")
def runs(limit: int = 50):
    rows = db.q("select thread_id, query, status, route, ts from runs order by ts desc limit ?", (limit,))
    return [dict(zip(("thread_id", "query", "status", "route", "ts"), r)) for r in rows]


@app.get("/runs/{thread_id}")
def run(thread_id: str):
    rows = db.q("select result from runs where thread_id=?", (thread_id,))
    if not rows:
        raise HTTPException(404)
    return json.loads(rows[0][0])


@app.get("/graph")
def graph():
    g = GRAPH.get_graph()
    return {"nodes": [n for n in g.nodes], "edges": [{"source": e.source, "target": e.target, "conditional": e.conditional} for e in g.edges],
            "mermaid": g.draw_mermaid()}


@app.get("/evals")
def evals():
    out = {}
    for p in sorted(RESULTS.glob("*.json")):
        d = json.loads(p.read_text())
        out[p.stem] = {"config": d.get("config"), "summary": d.get("summary"), "ragas": d.get("ragas"), "ours": d.get("ours"),
                       "table": d.get("table")}
    return out


@app.get("/evals/{tag}")
def eval_detail(tag: str):
    p = RESULTS / f"{Path(tag).name}.json"
    if not p.exists():
        raise HTTPException(404)
    return json.loads(p.read_text())


def _pct(xs: list, p: float):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))] if xs else None


@app.get("/metrics")
def metrics(hours: float = 24):
    """Production metrics from the telemetry tables (persist in Postgres when DATABASE_URL is set)."""
    since = time.time() - hours * 3600
    reqs = db.q("select id, ts, path, status, ms, commit_sha from requests where ts>? order by ts", (since,))
    calls = [dict(zip(("request_id", "ts", "tag", "model", "ms", "in", "out", "cost", "error"), r)) for r in
             db.q("select request_id, ts, tag, model, ms, tokens_in, tokens_out, cost, error from llm_calls where ts>? order by ts", (since,))]
    ok = [c for c in calls if not c["error"]]
    per_req = {}
    for c in ok:
        a = per_req.setdefault(c["request_id"], [0, 0.0])
        a[0] += c["in"] + c["out"]; a[1] += c["cost"]
    by = {}
    for c in ok:
        b = by.setdefault((c["tag"] or "other").split(":")[0], {"calls": 0, "ms": [], "tokens": 0, "cost": 0.0})
        b["calls"] += 1; b["ms"].append(c["ms"]); b["tokens"] += c["in"] + c["out"]; b["cost"] += c["cost"]
    lat = [c["ms"] for c in ok]
    hit = None
    if (rc := RESULTS / "retrieval_compare.json").exists():
        d = json.loads(rc.read_text())
        row = next((r for r in d["table"] if r["method"] == "hybrid_rerank_minilm"), None)
        hit = row and {"hit_at_k": row["hit"], "k": d["k"], "n_queries": d["n_queries"], "source": "offline eval (golden set)"}
    return {"window_hours": hours, "commit": obs.COMMIT, "tracing": obs.TRACING, "retrieval": hit,
            "requests": {"n": len(reqs), "p50_ms": _pct([r[4] for r in reqs], .5), "p95_ms": _pct([r[4] for r in reqs], .95),
                         "errors": sum(r[3] >= 500 for r in reqs), "rate_limited": sum(r[3] == 429 for r in reqs),
                         "error_rate": round(sum(r[3] >= 500 for r in reqs) / len(reqs), 3) if reqs else 0,
                         "tokens_per_query": round(statistics.mean(v[0] for v in per_req.values())) if per_req else 0,
                         "cost_per_query_usd": round(statistics.mean(v[1] for v in per_req.values()), 6) if per_req else 0,
                         "series": [{"ts": r[1], "ms": r[4], "status": r[3], "path": r[2]} for r in reqs[-200:]]},
            "calls": len(ok), "llm_errors": len(calls) - len(ok), "p50_ms": _pct(lat, .5), "p95_ms": _pct(lat, .95),
            "tokens": sum(c["in"] + c["out"] for c in ok), "cost_usd": round(sum(c["cost"] for c in ok), 5),
            "fallbacks": sum("fallback" in (c["tag"] or "") for c in ok),
            "by_tag": {k: {"calls": v["calls"], "avg_ms": round(statistics.mean(v["ms"])), "tokens": v["tokens"], "cost_usd": round(v["cost"], 5)} for k, v in by.items()},
            "recent": calls[-30:]}


class FeedbackIn(BaseModel):
    ref_id: str               # /ask request_id or investigation thread_id
    rating: str               # up | down
    question: str
    answer: str = ""
    comment: str = ""


@app.post("/feedback", dependencies=[Depends(auth.require_user)])
def feedback(body: FeedbackIn):
    if body.rating not in ("up", "down"):
        raise HTTPException(400, "rating must be up|down")
    fid = uuid.uuid4().hex[:12]
    db.q("insert into feedback values (?,?,?,?,?,?,?,?)", (fid, time.time(), obs.user_id.get(), body.ref_id, body.rating,
                                                       obs.redact(body.question)[:2000], obs.redact(body.answer)[:4000], obs.redact(body.comment)[:1000]))
    return {"id": fid}
