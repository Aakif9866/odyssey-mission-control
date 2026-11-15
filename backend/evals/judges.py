"""LLM-as-judge evaluators (DeepSeek). Each verdict schema puts `explanation` BEFORE the boolean:
the model reasons first, then commits, which makes it more accurate and leaves an audit trail."""
from pydantic import BaseModel, Field
from app.llm import chat


class Verdict(BaseModel):
    explanation: str = Field(description="Step-by-step reasoning, written before the verdict")
    passed: bool


PROMPTS = {
    "correctness": """You grade an answer against a GROUND TRUTH answer.
PASS if the answer's facts match the ground truth and it contains no conflicting statements.
Extra correct detail is fine. Missing the key fact, or stating a different value, is FAIL.""",
    "relevance": """You grade whether an ANSWER addresses the QUESTION.
PASS if it directly and concisely answers what was asked (a clear "I don't know" counts as addressing it).""",
    "groundedness": """You grade whether an ANSWER is fully supported by the CONTEXT.
PASS only if every factual claim in the answer can be found in, or directly computed from, the context.
Any claim not supported by the context is a hallucination: FAIL. A refusal ("I don't know") is grounded.""",
    "retrieval_relevance": """You grade whether the retrieved CONTEXT contains the information needed to answer the QUESTION.
PASS if the context contains the facts needed to answer. FAIL if it is off-topic or lacks the key fact.""",
}


def judge(metric: str, *, question: str = "", answer: str = "", context: str = "", reference: str = "") -> Verdict:
    parts = {"QUESTION": question, "GROUND TRUTH": reference, "CONTEXT": context, "ANSWER": answer}
    needed = {"correctness": ["QUESTION", "GROUND TRUTH", "ANSWER"], "relevance": ["QUESTION", "ANSWER"],
              "groundedness": ["CONTEXT", "ANSWER"], "retrieval_relevance": ["QUESTION", "CONTEXT"]}[metric]
    user = "\n\n".join(f"{k}:\n{parts[k]}" for k in needed)
    return chat([{"role": "system", "content": PROMPTS[metric]}, {"role": "user", "content": user}],
                role="judge", schema=Verdict, max_tokens=800, temperature=0, tag=f"judge:{metric}")
