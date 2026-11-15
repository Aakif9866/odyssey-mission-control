"""Run / resume investigations.
  uv run python -m app.agent "Investigate ANM-0042 and recommend next steps"
  uv run python -m app.agent --resume <thread_id> approved"""
import sys, uuid
from langgraph.types import Command
from app.graph import GRAPH


def _result(thread_id, out):
    pending = out.get("__interrupt__")
    st = GRAPH.get_state({"configurable": {"thread_id": thread_id}}).values
    return {"thread_id": thread_id, "status": "awaiting_approval" if pending else "done",
            "interrupt": pending[0].value if pending else None,
            **{k: st.get(k) for k in ("query", "route", "answer", "citations", "assessment", "approval", "tool_calls", "evidence", "flags", "trace", "steps")}}


def start(query: str, thread_id: str | None = None, fault: str | None = None) -> dict:
    thread_id = thread_id or uuid.uuid4().hex[:12]
    cfg = {"configurable": {"thread_id": thread_id}, "recursion_limit": 40}
    return _result(thread_id, GRAPH.invoke({"query": query, "fault": fault, "steps": 0}, cfg))


def resume(thread_id: str, decision: str) -> dict:
    cfg = {"configurable": {"thread_id": thread_id}, "recursion_limit": 40}
    return _result(thread_id, GRAPH.invoke(Command(resume=decision), cfg))


def show(r):
    print(f"thread={r['thread_id']} route={r['route']} status={r['status']}")
    for e in r["trace"] or []:
        print(f"  {e['ms']:6}ms  {e['node']:15} {e['summary'][:110]}")
    if r["interrupt"]:
        print(f"\n⏸  APPROVAL NEEDED: {r['interrupt']['proposed_action']}\n   reason: {r['interrupt']['reason']}")
    if r["answer"]:
        print(f"\nANSWER: {r['answer']}\nCITATIONS: {r['citations']}  FLAGS: {r['flags']}")


if __name__ == "__main__":
    if sys.argv[1] == "--resume":
        show(resume(sys.argv[2], sys.argv[3]))
    else:
        show(start(" ".join(sys.argv[1:])))
