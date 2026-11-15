from qdrant_client import models as qm
from app.config import COLLECTION
from app.store import client, embed


def search(query: str, k: int = 5, mode: str = "dense", **filters) -> list[dict]:
    """Dense semantic search. filters e.g. planet="Kepler-Vex", status="current"."""
    flt = qm.Filter(must=[qm.FieldCondition(key=f, match=qm.MatchValue(value=v)) for f, v in filters.items()]) if filters else None
    hits = client().query_points(COLLECTION, query=embed([query])[0], using="dense", query_filter=flt, limit=k).points
    return [h.payload | {"score": round(h.score, 3)} for h in hits]
