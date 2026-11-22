"""Odyssey API.  uv run uvicorn app.api:app --port 8000"""
import asyncio, json, logging, sqlite3, statistics, time, uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langgraph.types import Command
from pydantic import BaseModel
from app import agent, llm, tools
from app.chunking import parse_front_matter
from app.config import BACKEND, COLLECTION, CORPUS_DIR, STATE, UPLOADS_DIR
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
DB = sqlite3.connect(STATE / "runs.sqlite", check_same_thread=False)
DB.execute("create table if not exists runs (thread_id text primary key, query text, status text, route text, ts real, result text)")


def save_run(r: dict):
    DB.execute("insert or replace into runs values (?,?,?,?,?,?)",
               (r["thread_id"], r["query"], r["status"], r["route"], time.time(), json.dumps(r, default=str)))
    DB.commit()


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


@app.post("/ingest")
async def ingest(file: UploadFile):
    if not file.filename.endswith(".md"):
        raise HTTPException(400, "only .md files (with optional YAML front matter)")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    dest = UPLOADS / Path(file.filename).name
    dest.write_bytes(await file.read())
    ensure_collection()
    return {"source": dest.name, "chunks": ingest_file(dest)}


@app.post("/ask")
def ask(body: AskIn):
    if body.mode not in MODES:
        raise HTTPException(400, f"mode must be one of {MODES}")
    return answer(body.question, k=body.k, mode=body.mode)


@app.post("/search")
def search_compare(body: SearchIn):
    out = {}
    for m in body.modes:
        t = time.perf_counter()
        hits = search(body.query, k=body.k, mode=m)
        out[m] = {"ms": round((time.perf_counter() - t) * 1000), "hits": hits}
    return out


@app.post("/investigate")
def investigate(body: InvestigateIn):
    r = agent.start(body.query, fault=body.fault)
    save_run(r)
    return r


@app.post("/investigate/{thread_id}/resume")
def investigate_resume(thread_id: str, body: ResumeIn):
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be approved|rejected")
    r = agent.resume(thread_id, body.decision)
    save_run(r)
    return r


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@app.get("/investigate/stream")
async def investigate_stream(query: str, thread_id: str | None = None, decision: str | None = None):
    """Server-Sent Events: one event per graph node as it finishes, then a final 'done' event."""
    thread_id = thread_id or uuid.uuid4().hex[:12]
    cfg = {"configurable": {"thread_id": thread_id}, "recursion_limit": 40}
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

        loop.run_in_executor(None, work)
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
    rows = DB.execute("select thread_id, query, status, route, ts from runs order by ts desc limit ?", (limit,)).fetchall()
    return [dict(zip(("thread_id", "query", "status", "route", "ts"), r)) for r in rows]


@app.get("/runs/{thread_id}")
def run(thread_id: str):
    row = DB.execute("select result from runs where thread_id=?", (thread_id,)).fetchone()
    if not row:
        raise HTTPException(404)
    return json.loads(row[0])


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


@app.get("/metrics")
def metrics():
    calls = list(llm.CALLS)
    if not calls:
        return {"calls": 0}
    lat = sorted(c["ms"] for c in calls)
    by = {}
    for c in calls:
        b = by.setdefault(c["tag"].split(":")[0] or "other", {"calls": 0, "ms": [], "tokens": 0, "cost": 0.0})
        b["calls"] += 1; b["ms"].append(c["ms"]); b["tokens"] += c["in"] + c["out"]; b["cost"] += c["cost"]
    return {"calls": len(calls), "p50_ms": lat[len(lat) // 2], "p95_ms": lat[int(len(lat) * 0.95)],
            "tokens": sum(c["in"] + c["out"] for c in calls), "cost_usd": round(sum(c["cost"] for c in calls), 5),
            "fallbacks": sum("fallback" in c["tag"] for c in calls),
            "by_tag": {k: {"calls": v["calls"], "avg_ms": round(statistics.mean(v["ms"])), "tokens": v["tokens"], "cost_usd": round(v["cost"], 5)} for k, v in by.items()},
            "recent": calls[-30:]}
