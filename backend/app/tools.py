"""Agent tools. All READ-ONLY. Requesting Director approval is deliberately NOT a tool:
only the graph's human_approval node (an interrupt) can produce an approval."""
import json
from app.retrieve import search

RETRIEVAL_MODE = "dense"  # upgraded in M4

# Structured mission DB (a real system would query Postgres/an ops API). Consistent with data/corpus.
MISSIONS = {
    "ODY-03": {"name": "Meridian", "planet": "Kepler-Vex", "status": "active", "risk_class": "B", "crew_size": 6,
               "commander": "Lt. Cdr. Tomas Varga (acting since Sol 46; Cdr. Okafor-Reyes injured)",
               "boreholes": {"BH-1": "22 m sampled", "BH-2": "halted at 38 m, bit fractured", "BH-3": "not started"},
               "seismometers": {"S1": "online", "S2": "online", "S3": "offline (maintenance)", "S4": "online"},
               "pending_approvals": ["Deploy 4 additional seismometers (ANM-0042)"]},
    "ODY-04": {"name": "Ember", "planet": "Cinder", "status": "active (robotic)", "risk_class": "C", "crew_size": 0,
               "landers": {"Kiln-1": "lost 2239-08-19", "Kiln-2": "operational"}, "pending_approvals": []},
    "ODY-05": {"name": "Deepwater", "planet": "Thalassa Prime", "status": "planning", "risk_class": "A", "crew_size": 4,
               "commander": "Amara Lindqvist", "planned_launch": "2242-06-01",
               "pending_approvals": ["Radiation waiver (surface dose 5.4 Sv/year)"]},
}
CREW = {
    "ODY-03": [{"name": "Imani Okafor-Reyes", "role": "Commander", "status": "injured (fractured wrist, Sol 46), relieved of command"},
               {"name": "Tomas Varga", "role": "Pilot, acting commander", "status": "active"},
               {"name": "Priya Raman", "role": "Astrobiologist", "status": "active"},
               {"name": "Lukas Brandt", "role": "Glaciologist, drill lead", "status": "active"},
               {"name": "Sofia Mendez-Hale", "role": "Systems engineer", "status": "active"},
               {"name": "Kenji Watanabe", "role": "Geophysicist", "status": "active"}],
    "ODY-05": [{"name": "Amara Lindqvist", "role": "Commander"}, {"name": "Felix Osei", "role": "Oceanographer"},
               {"name": "Rhea Castellanos", "role": "Engineer"}, {"name": "Mei-Lin Zhou", "role": "Radiation physician"}],
}
APPROVAL_RULES = [  # (keywords, reason): deterministic policy, no LLM
    (("seismometer", "deploy", "hardware", "install"), "New hardware deployments require Director approval (HED policy, ODY-03 brief)."),
    (("drill", "depth", "borehole", "resume drilling"), "Exceeding approved drilling limits (RD-440 v2: 25 m below -130 °C) requires Director approval."),
    (("waiver", "radiation", "launch"), "Radiation waivers and launch clearance for risk class A require Director approval."),
    (("risk class", "evacuat", "abort"), "Changes to mission risk class require Director approval."),
]


def search_docs(query: str, planet: str | None = None) -> list[dict]:
    filters = {"planet": planet} if planet else {}
    hits = search(query, k=4, mode=RETRIEVAL_MODE, **filters)
    return [{"doc_id": h["doc_id"], "score": h["score"], "text": h["text"][:600]} for h in hits]


def get_mission(mission_id: str) -> dict:
    m = MISSIONS.get(mission_id.upper())
    return m if m else {"error": f"unknown mission {mission_id}; known: {list(MISSIONS)}"}


def get_crew(mission_id: str) -> list | dict:
    return CREW.get(mission_id.upper(), {"error": f"no crew record for {mission_id}"})


def check_approval_policy(action: str) -> dict:
    a = action.lower()
    reasons = [r for kws, r in APPROVAL_RULES if any(k in a for k in kws)]
    return {"action": action, "needs_director_approval": bool(reasons), "reasons": reasons}


REGISTRY = {"search_docs": search_docs, "get_mission": get_mission, "get_crew": get_crew, "check_approval_policy": check_approval_policy}

SCHEMAS = [
    {"type": "function", "function": {"name": "search_docs", "description": "Semantic search over HED mission documents (reports, logs, manuals, briefs). Returns top chunks with doc_id.",
     "parameters": {"type": "object", "properties": {"query": {"type": "string"},
                    "planet": {"type": "string", "enum": ["Kepler-Vex", "Thalassa Prime", "Cinder"], "description": "Optional filter"}}, "required": ["query"]}}},
    {"type": "function", "function": {"name": "get_mission", "description": "Structured live status of a mission: status, risk class, commander, equipment, pending approvals.",
     "parameters": {"type": "object", "properties": {"mission_id": {"type": "string", "description": "e.g. ODY-03"}}, "required": ["mission_id"]}}},
    {"type": "function", "function": {"name": "get_crew", "description": "Current crew list and status for a mission.",
     "parameters": {"type": "object", "properties": {"mission_id": {"type": "string"}}, "required": ["mission_id"]}}},
    {"type": "function", "function": {"name": "check_approval_policy", "description": "Check whether a proposed action requires Director approval under HED policy.",
     "parameters": {"type": "object", "properties": {"action": {"type": "string"}}, "required": ["action"]}}},
]


def run_tool(name: str, args_json: str, fault: str | None = None) -> tuple[bool, str]:
    """Execute a tool. Errors are returned as text so the agent can recover, never raised into the graph."""
    try:
        if name not in REGISTRY:
            return False, f"ERROR: unknown tool {name}"
        if fault == name:
            raise TimeoutError(f"{name} timed out (injected fault)")
        return True, json.dumps(REGISTRY[name](**json.loads(args_json or "{}")), ensure_ascii=False)
    except Exception as e:
        return False, f"ERROR: {type(e).__name__}: {e}. Try a different tool or arguments."
