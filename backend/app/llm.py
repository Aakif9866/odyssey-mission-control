"""Thin OpenAI-compatible client. Every call is logged (latency, tokens, cost) to CALLS for observability.
Generator calls fall back to the judge provider (DeepSeek) if Groq errors or times out."""
import json, logging, re, time
from openai import BadRequestError, OpenAI, RateLimitError
from pydantic import BaseModel, ValidationError
from app.config import GEN, JUDGE

log = logging.getLogger("llm")
CALLS: list[dict] = []  # ponytail: in-memory call log, capped; move to a trace store/DB at scale
_clients = {"gen": OpenAI(api_key=GEN["api_key"], base_url=GEN["base_url"], timeout=30, max_retries=2),
            "judge": OpenAI(api_key=JUDGE["api_key"], base_url=JUDGE["base_url"], timeout=60, max_retries=2)}
_models = {"gen": GEN["model"], "judge": JUDGE["model"]}
# USD per 1M tokens (input, output), list prices; used for cost estimates only
PRICES = {"openai/gpt-oss-120b": (0.15, 0.60), "openai/gpt-oss-20b": (0.075, 0.30), "deepseek-flash": (0.30, 1.20)}
FAST_MODEL = "openai/gpt-oss-20b"  # routing, rewriting, guard checks
FALLBACK = True  # evals set False: a silent provider switch would mislabel the experiment


def cost(model: str, tin: int, tout: int) -> float:
    pin, pout = PRICES.get(model, (0, 0))
    return (tin * pin + tout * pout) / 1e6


def chat(messages: list[dict], role: str = "gen", schema: type[BaseModel] | None = None,
         max_tokens: int = 1500, model: str | None = None, tag: str = "", **kw):
    """Returns a parsed Pydantic object if `schema` is given, else text."""
    model = model or _models[role]
    try:
        for attempt in range(6):  # rate limit = expected on free tiers: wait as told, don't switch models
            try:
                return _call(role, model, messages, schema, max_tokens, tag, dict(kw))
            except (json.JSONDecodeError, ValidationError) as e:  # truncated/invalid JSON: retry with more room
                if attempt == 5:
                    raise
                log.warning("invalid structured output (%s), retrying", type(e).__name__)
                max_tokens = min(max_tokens * 2, 4000)
            except RateLimitError as e:
                if attempt == 5:
                    raise
                wait = float(m.group(1)) if (m := re.search(r"try again in ([\d.]+)s", str(e))) else 2 ** attempt
                log.warning("rate limited on %s, waiting %.1fs", model, wait + 0.5)
                time.sleep(wait + 0.5)
    except Exception as e:
        if role != "gen" or not FALLBACK:
            raise
        log.warning("gen provider failed (%s: %s); falling back to %s", type(e).__name__, e, _models["judge"])
        return _call("judge", _models["judge"], messages, schema, max_tokens, tag + ":fallback", {})


def _call(role, model, messages, schema, max_tokens, tag, kw):
    if "gpt-oss" in model:
        kw.setdefault("reasoning_effort", "low")  # reasoning tokens count against max_tokens
    if schema and role == "gen":  # Groq: strict JSON schema (server-side constrained decoding)
        kw["response_format"] = {"type": "json_schema", "json_schema": {
            "name": schema.__name__, "strict": True, "schema": _strict(schema.model_json_schema())}}
    elif schema:  # DeepSeek: JSON mode only, so describe the schema in the prompt; Pydantic validates
        kw["response_format"] = {"type": "json_object"}
        messages = messages + [{"role": "system", "content": "Respond ONLY with a JSON object matching this JSON schema:\n"
                                + json.dumps(_strict(schema.model_json_schema()))}]
    t = time.perf_counter()
    r = _clients[role].chat.completions.create(model=model, messages=messages, max_tokens=max_tokens, **kw)
    ms = round((time.perf_counter() - t) * 1000)
    u = r.usage
    rec = {"tag": tag, "role": role, "model": model, "ms": ms, "in": u.prompt_tokens, "out": u.completion_tokens,
           "cost": round(cost(model, u.prompt_tokens, u.completion_tokens), 6), "ts": time.time()}
    CALLS.append(rec)
    del CALLS[:-2000]
    log.info("%s", rec)
    text = r.choices[0].message.content or ""
    return schema.model_validate(json.loads(text)) if schema else text


def _strict(s: dict) -> dict:
    """Strict mode needs additionalProperties=false and every property required."""
    if s.get("type") == "object":
        s["additionalProperties"] = False
        s["required"] = list(s.get("properties", {}))
    for v in list(s.get("properties", {}).values()) + list(s.get("$defs", {}).values()):
        _strict(v)
    for key in ("items", "anyOf"):
        for v in (s[key] if isinstance(s.get(key), list) else [s[key]] if key in s else []):
            _strict(v)
    return s


def chat_tools(messages: list[dict], tools: list[dict], tag: str = "agent", max_tokens: int = 1200) -> dict:
    """One tool-calling turn (native OpenAI-format tools). Returns the assistant message as a dict."""
    model = _models["gen"]
    for attempt in range(6):
        try:
            t = time.perf_counter()
            r = _clients["gen"].chat.completions.create(model=model, messages=messages, tools=tools, tool_choice="auto",
                                                        max_tokens=max_tokens, reasoning_effort="low")
            break
        except RateLimitError as e:
            if attempt == 5:
                raise
            m = re.search(r"try again in ([\d.]+)s", str(e))
            time.sleep((float(m.group(1)) if m else 2 ** attempt) + 0.5)
        except BadRequestError as e:  # Groq validates tool args server-side; a resample usually produces valid args
            if "tool call validation failed" not in str(e) or attempt >= 2:
                raise
            log.warning("invalid tool-call args, resampling: %s", str(e)[:160])
    u, msg = r.usage, r.choices[0].message
    CALLS.append({"tag": tag, "role": "gen", "model": model, "ms": round((time.perf_counter() - t) * 1000),
                  "in": u.prompt_tokens, "out": u.completion_tokens, "cost": round(cost(model, u.prompt_tokens, u.completion_tokens), 6), "ts": time.time()})
    out = {"role": "assistant", "content": msg.content or ""}
    if msg.tool_calls:
        out["tool_calls"] = [{"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                             for tc in msg.tool_calls]
    return out
