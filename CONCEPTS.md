# Can I Explain It?

Answer out loud (or in chat) **without notes** at the end of each module. Tick only if you could explain it to another engineer.
Weak ones → ask Claude for a 2-minute re-explain + one example from Odyssey.

## RAG
- [ ] Why RAG instead of fine-tuning or a long context window, and when each wins
- [ ] What happens to retrieval quality as chunk size goes up/down, and what overlap fixes
- [ ] What an embedding captures and what it *misses* (exact codes, negation, numbers)
- [ ] How HNSW makes search fast and what "approximate" costs you
- [ ] How you'd handle a document being updated (v1 → v2) without stale answers
- [ ] 4 retrieval failure modes and how you'd detect each

## LLM Evaluation
- [ ] Why a plausible answer can still be wrong, and which metric catches it
- [ ] Faithfulness vs correctness vs answer relevancy, in one sentence each
- [ ] Context precision vs context recall, and which needs a reference
- [ ] How LLM-as-judge works and 3 of its biases
- [ ] How to tell whether a failure came from retrieval or from generation

## LangGraph
- [ ] How state flows between nodes and what a reducer does
- [ ] Conditional edge vs a node that decides: when to use which
- [ ] What a checkpointer stores and how resume/interrupts use it
- [ ] How a tool call travels: model → tool node → back to model
- [ ] How you'd make a node reliable (retry, timeout, fallback, validation)

## Advanced RAG
- [ ] Why dense search alone fails, with a concrete Odyssey example
- [ ] BM25 intuition: TF saturation, IDF, length normalization
- [ ] RRF formula and why it doesn't need score normalization
- [ ] Bi-encoder vs cross-encoder: speed and accuracy trade-off
- [ ] How you compared retrieval strategies and what the numbers said

## Agent Evaluation
- [ ] Final-answer eval vs trajectory eval, and why you need both
- [ ] How you measured tool-call and routing accuracy
- [ ] How you tested failure recovery
- [ ] What a regression gate is and where it runs

## Harness + Guardrails
- [ ] What an agent harness is and what ours controls (loop, tools, context, permissions, limits)
- [ ] Direct vs indirect prompt injection, and why RAG + tools raises the stakes
- [ ] The 4 guardrail layers and one concrete check at each
- [ ] Why deterministic checks come before LLM classifiers
- [ ] Why the approval tool can't be triggered by model text alone

## Production
- [ ] Draw Odyssey's architecture from memory
- [ ] Where latency and cost come from in one request, and 3 ways to cut them
- [ ] What happens when the LLM provider fails, step by step
- [ ] How you'd monitor answer quality in production and use user feedback
- [ ] What changes at 100× documents and 100× concurrent users
