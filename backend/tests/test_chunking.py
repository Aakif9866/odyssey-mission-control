from app.chunking import chunk_document, parse_front_matter
from app.config import CORPUS_DIR

DOC = "# Title\n\nintro\n\n## Specs\n" + "x" * 2000 + "\n\n## Codes\nE-217: swap cartridge\n"


def test_front_matter():
    meta, body = parse_front_matter((CORPUS_DIR / "manual-rd440-drill-v2.md").read_text())
    assert meta["doc_id"] == "MAN-RD440" and meta["version"] == 2 and body.lstrip().startswith("# ")


def test_chunks():
    chunks = chunk_document(DOC, max_chars=800, overlap=100)
    heads = [c["heading"] for c in chunks]
    assert heads.count("## Specs") >= 3, "long section must be windowed"
    assert all(len(c["text"]) <= 800 + 100 for c in chunks), "chunk body ~max_chars (+ header)"
    assert all(c["text"].startswith("Title") for c in chunks), "contextual header missing"
    assert any("E-217" in c["text"] for c in chunks)
    specs = [c["text"].split("\n", 1)[1] for c in chunks if c["heading"] == "## Specs"]
    assert specs[0][-100:] == specs[1][:100], "consecutive windows must overlap by `overlap` chars"
