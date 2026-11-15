"""Index the corpus: parse → chunk → embed → upsert.  Run: uv run python -m app.ingest"""
import uuid
from pathlib import Path
from qdrant_client import models as qm
from app.chunking import chunk_document, parse_front_matter
from app.config import COLLECTION, CORPUS_DIR
from app.store import client, embed

META_KEYS = ("doc_id", "type", "planet", "mission", "version", "status", "date")


def ensure_collection():
    c = client()
    if not c.collection_exists(COLLECTION):
        c.create_collection(COLLECTION, vectors_config={"dense": qm.VectorParams(size=384, distance=qm.Distance.COSINE)})


def ingest_file(path: Path, max_chars=800, overlap=100) -> int:
    meta, body = parse_front_matter(path.read_text())
    meta = {k: str(meta[k]) for k in META_KEYS if k in meta} | {"source": path.name}
    chunks = chunk_document(body, max_chars, overlap)
    c = client()
    # Document update = delete this file's old chunks, then insert new ones (no stale or orphan chunks).
    c.delete(COLLECTION, qm.FilterSelector(filter=qm.Filter(must=[qm.FieldCondition(key="source", match=qm.MatchValue(value=path.name))])))
    vectors = embed([ch["text"] for ch in chunks])
    c.upsert(COLLECTION, [
        qm.PointStruct(id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{path.name}#{i}")), vector={"dense": v},
                       payload=meta | {"heading": ch["heading"], "text": ch["text"], "chunk": i})
        for i, (ch, v) in enumerate(zip(chunks, vectors))])
    return len(chunks)


def ingest_dir(folder: Path = CORPUS_DIR, **kw) -> dict:
    ensure_collection()
    return {p.name: ingest_file(p, **kw) for p in sorted(folder.glob("*.md"))}


if __name__ == "__main__":
    counts = ingest_dir()
    for name, n in counts.items():
        print(f"{n:3} chunks  {name}")
    print(f"total {sum(counts.values())} chunks in '{COLLECTION}'")
