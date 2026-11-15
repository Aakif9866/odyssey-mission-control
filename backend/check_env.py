"""Smoke test: both LLM providers answer. Run: uv run python check_env.py"""
import os, time
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv("../.env")
for name, key, url, model in [
    ("generator", "GROQ_API_KEY", "GEN_BASE_URL", "GEN_MODEL"),
    ("judge", "DEEPSEEK_API_KEY", "JUDGE_BASE_URL", "JUDGE_MODEL"),
]:
    try:
        client = OpenAI(api_key=os.environ[key], base_url=os.environ[url])
        t = time.perf_counter()
        r = client.chat.completions.create(model=os.environ[model], messages=[{"role": "user", "content": "Reply with: OK"}], max_tokens=20)
        print(f"✓ {name:9} {os.environ[model]:24} {(time.perf_counter()-t)*1000:5.0f} ms  tokens={r.usage.total_tokens}  → {r.choices[0].message.content!r}")
    except Exception as e:
        print(f"✗ {name:9} {type(e).__name__}: {e}")
