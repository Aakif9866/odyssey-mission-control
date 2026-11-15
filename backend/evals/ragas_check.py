# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["ragas>=0.4.4", "langchain-openai", "python-dotenv"]
# ///
"""RAGAS cross-check, isolated from the app env (ragas pins old openai/langchain).
  uv run evals/ragas_check.py baseline
Reads evals/results/<tag>.json written by rag_eval.py; never imports app/."""
import json, os, sys, warnings
from pathlib import Path
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
HERE = Path(__file__).parent
load_dotenv(HERE.parents[1] / ".env")

from langchain_openai import ChatOpenAI
from ragas import EvaluationDataset, evaluate
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import Faithfulness, LLMContextPrecisionWithReference, LLMContextRecall

tag = sys.argv[1] if len(sys.argv) > 1 else "baseline"
data = json.loads((HERE / "results" / f"{tag}.json").read_text())
cases = [c for c in data["cases"] if c["retrieval"]]  # skip unanswerable
ds = EvaluationDataset.from_list([{"user_input": c["question"], "response": c["answer"], "reference": c["reference"],
                                   "retrieved_contexts": c["contexts"]} for c in cases])
llm = LangchainLLMWrapper(ChatOpenAI(model=os.environ["JUDGE_MODEL"], base_url=os.environ["JUDGE_BASE_URL"],
                                     api_key=os.environ["DEEPSEEK_API_KEY"], temperature=0))
res = evaluate(ds, metrics=[Faithfulness(), LLMContextPrecisionWithReference(), LLMContextRecall()], llm=llm, show_progress=False)
df = res.to_pandas()
ours = {"faithfulness": "groundedness", "llm_context_precision_with_reference": "ctx_precision", "context_recall": "ctx_recall"}
out = {"tag": tag, "ragas": {k: round(float(df[k].mean()), 3) for k in ours},
       "ours": {k: data["summary"][v] for k, v in ours.items()}}
(HERE / "results" / f"ragas_{tag}.json").write_text(json.dumps(out, indent=2))
print(f"{'metric':40} {'RAGAS':>7} {'ours':>7}")
for k, v in ours.items():
    print(f"{k:40} {out['ragas'][k]:7.3f} {out['ours'][k]:7.3f}   (ours = {v})")
