"""Qdrant + embedding models. One place to change infra.
Embedded mode (a folder) locks to ONE process; set QDRANT_URL to use a Qdrant server for multi-process access."""
import atexit, os, threading
from functools import lru_cache
from fastembed import TextEmbedding
from qdrant_client import QdrantClient
from app.config import DENSE_MODEL, MODELS_DIR, QDRANT_PATH

_lock = threading.Lock()


@lru_cache
def _client() -> QdrantClient:
    url = os.getenv("QDRANT_URL")
    c = QdrantClient(url=url) if url else QdrantClient(path=QDRANT_PATH)
    atexit.register(c.close)
    return c


@lru_cache
def _embedder() -> TextEmbedding:
    return TextEmbedding(DENSE_MODEL, cache_dir=MODELS_DIR)


def client() -> QdrantClient:
    with _lock:  # lru_cache isn't thread-safe on first call → two threads could open the DB
        return _client()


def embedder() -> TextEmbedding:
    with _lock:
        return _embedder()


def embed(texts: list[str]) -> list[list[float]]:
    return [v.tolist() for v in embedder().embed(texts)]
