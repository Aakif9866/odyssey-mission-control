import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

CORPUS_DIR = ROOT / "data" / "corpus"
BACKEND = ROOT / "backend"
MODELS_DIR = str(BACKEND / ".models")
QDRANT_PATH = str(BACKEND / ".qdrant")
COLLECTION = "odyssey"

DENSE_MODEL = "BAAI/bge-small-en-v1.5"  # 384-d

GEN = dict(api_key=os.getenv("GROQ_API_KEY"), base_url=os.getenv("GEN_BASE_URL"), model=os.getenv("GEN_MODEL"))
JUDGE = dict(api_key=os.getenv("DEEPSEEK_API_KEY"), base_url=os.getenv("JUDGE_BASE_URL"), model=os.getenv("JUDGE_MODEL"))
