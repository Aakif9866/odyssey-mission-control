# Krish Naik notebook: what it covers (and where Odyssey stands)

Source: https://github.com/krishnaik06/RAG-Tutorials/blob/main/1-rag_evaluation.ipynb

## What he teaches (short version)
1. **The 3-step eval loop**: make a dataset (question + expected answer) → run your app on it → score with evaluators.
2. **Chatbot eval**: 5 toy Q&A pairs; a *correctness* LLM judge ("CORRECT/INCORRECT") and a *concision* check in plain code (answer < 2x reference length).
3. **Experiments**: run the same dataset on two models (gpt-4o-mini vs gpt-4-turbo) and compare in LangSmith.
4. **A tiny RAG bot**: 3 blog posts → 250-token chunks → in-memory vector store → top-6 → answer in ≤3 sentences.
5. **Four RAG evaluators** (all LLM-as-judge, structured output with `explanation` before the verdict):
   | Evaluator | Compares | Needs reference? |
   |---|---|---|
   | Correctness | answer vs expected answer | yes |
   | Relevance | answer vs question | no |
   | Groundedness | answer vs retrieved docs | no |
   | Retrieval relevance | retrieved docs vs question | no |
6. **LangSmith plumbing**: `Client().create_dataset`, `client.evaluate(target, evaluators=[...])`, `@traceable`.

## The system-design ideas worth keeping
- **Evaluate each arrow in the pipeline separately**: question→docs (retrieval), docs→answer (groundedness), answer→question (relevance), answer→truth (correctness). A failure then points to *which component* broke.
- **Reference-free metrics scale**: groundedness and relevance need no expected answer, so they can run on live production traffic.
- **Explanation-before-verdict** makes judges more accurate and debuggable.
- **Same dataset, different configs = experiment**: the basis of every model/prompt/retriever decision.

## What it doesn't cover (Odyssey does)
- Code-based retrieval metrics (hit@k, MRR, context precision/recall): exact, free, no judge bias. His retrieval judge passes if *any* keyword matches, which is very lenient.
- Hard cases: outdated versions, contradictions, distractors, unanswerable questions.
- Judge calibration (does the judge agree with a human?).
- Regression gates in CI, agent/trajectory evaluation, guardrail attack tests, cost and latency.

## Odyssey equivalent
`backend/evals/rag_eval.py`: the same 4 judges (DeepSeek, a different family from the generator) + concision + retrieval metrics, on an 18-case golden set. Results go to `evals/results/*.json`. LangSmith upload is optional (`LANGSMITH_API_KEY`).
