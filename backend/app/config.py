import os
from pathlib import Path
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
load_dotenv(ROOT / ".env")

# On Vercel the bundle is read-only and /tmp is the only writable disk (per instance, wiped on cold start):
# models, the Qdrant index and SQLite state are rebuilt there. Locally everything stays in backend/.
STATE = Path("/tmp/odyssey") if os.getenv("VERCEL") else BACKEND
STATE.mkdir(parents=True, exist_ok=True)
CORPUS_DIR = ROOT / "data" / "corpus"
if not CORPUS_DIR.is_dir():
    CORPUS_DIR = BACKEND / "corpus"  # deploy: the backend service's build copies data/corpus in
UPLOADS_DIR = ROOT / "data" / "uploads" if STATE == BACKEND else STATE / "uploads"
MODELS_DIR = str(STATE / ".models")
QDRANT_PATH = str(STATE / ".qdrant")
COLLECTION = "odyssey"

DENSE_MODEL = "BAAI/bge-small-en-v1.5"  # 384-d

GEN = dict(api_key=os.getenv("GROQ_API_KEY"), base_url=os.getenv("GEN_BASE_URL"), model=os.getenv("GEN_MODEL"))
JUDGE = dict(api_key=os.getenv("DEEPSEEK_API_KEY"), base_url=os.getenv("JUDGE_BASE_URL"), model=os.getenv("JUDGE_MODEL"))
