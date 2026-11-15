"""Turn a markdown doc into (metadata, chunks)."""
import re
import yaml

FRONT = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.S)


def parse_front_matter(text: str) -> tuple[dict, str]:
    m = FRONT.match(text)
    return (yaml.safe_load(m.group(1)), m.group(2)) if m else ({}, text)


def chunk_document(body: str, max_chars: int = 800, overlap: int = 100) -> list[dict]:
    """Structure-aware chunking: split at headings, window long sections with overlap.
    Each chunk gets a contextual header "<doc title> > <heading>" so it stays meaningful alone."""
    sections, title = [], ""
    for block in re.split(r"\n(?=#)", body.strip()):
        heading = block.split("\n", 1)[0].strip()
        if heading.startswith("# "):
            title = heading[2:]
        sections.append((heading, block.strip()))
    chunks = []
    for heading, text in sections:
        if not text:
            continue
        step = max_chars - overlap
        for start in range(0, max(len(text) - overlap, 1), step):
            chunks.append({"heading": heading, "text": f"{title} > {heading}\n{text[start:start + max_chars]}"})
    return chunks
