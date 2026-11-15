"""Guardrails. Deterministic checks first; LLM classifiers added in M6."""
import re

MAX_QUERY_CHARS = 2000
INJECTION_PATTERNS = re.compile(
    r"ignore (all )?(previous|prior|above) instructions|system notice to ai|you are now|disregard (the )?(rules|instructions)|"
    r"reveal (your )?(system )?prompt|do not mention this", re.I)


def check_input(query: str) -> tuple[bool, str]:
    if not query.strip():
        return False, "empty query"
    if len(query) > MAX_QUERY_CHARS:
        return False, f"query too long ({len(query)} > {MAX_QUERY_CHARS} chars)"
    if INJECTION_PATTERNS.search(query):
        return False, "prompt-injection pattern in user input"
    return True, "ok"


def check_citations(citations: list[str], evidence_ids: set[str]) -> tuple[list[str], list[str]]:
    """Split citations into (valid, invalid). Invalid = cited a doc never retrieved → hallucinated source."""
    return [c for c in citations if c in evidence_ids], [c for c in citations if c not in evidence_ids]
