"""Vercel entrypoint (the app lives in app/api.py)."""
import os

os.environ.setdefault("HF_HOME", "/tmp/hf")  # Hugging Face's download cache must be writable; only /tmp is on Vercel
from app.api import app  # noqa: E402,F401
