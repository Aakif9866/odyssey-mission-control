"""Qdrant + local models (fastembed). One place to change infra.
Embedded mode (a folder) locks to ONE process; set QDRANT_URL to use a Qdrant server for multi-process access."""
import atexit, os, threading
from functools import lru_cache
from fastembed import SparseTextEmbedding, TextEmbedding
from fastembed.rerank.cross_encoder import TextCrossEncoder
from qdrant_client import QdrantClient, models as qm
from app.config import DENSE_MODEL, MODELS_DIR, QDRANT_PATH

SPARSE_MODEL = "Qdrant/bm25"
RERANKERS = {"bge": "BAAI/bge-reranker-v2-m3-int8", "minilm": "Xenova/ms-marco-MiniLM-L-6-v2"}
_lock = threading.Lock()


@lru_cache
def _client() -> QdrantClient:
    url = os.getenv("QDRANT_URL")
    c = QdrantClient(url=url) if url else QdrantClient(path=QDRANT_PATH)
    atexit.register(c.close)
    return c


@lru_cache
def _model(kind: str, name: str):
    cls = {"dense": TextEmbedding, "sparse": SparseTextEmbedding, "rerank": TextCrossEncoder}[kind]
    return cls(name, cache_dir=MODELS_DIR)


def client() -> QdrantClient:
    with _lock:  # lru_cache isn't thread-safe on first call → two threads could open the DB
        return _client()


def model(kind: str, name: str):
    with _lock:
        return _model(kind, name)


def embed(texts: list[str]) -> list[list[float]]:
    return [v.tolist() for v in model("dense", DENSE_MODEL).embed(texts)]


def embed_sparse(texts: list[str], query: bool = False) -> list[qm.SparseVector]:
    m = model("sparse", SPARSE_MODEL)
    vecs = m.query_embed(texts) if query else m.embed(texts)
    return [qm.SparseVector(indices=v.indices.tolist(), values=v.values.tolist()) for v in vecs]


def rerank(query: str, texts: list[str], which: str = "bge") -> list[float]:
    return list(model("rerank", RERANKERS[which]).rerank(query, texts))
