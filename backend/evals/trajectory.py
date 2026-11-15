"""Trajectory matching: compare the tools an agent actually called with what we expected."""


def exact(actual: list[str], expected: list[str]) -> bool:
    return actual == expected


def subset(actual: list[str], expected: list[str]) -> bool:
    """Every expected tool was called at least once (order/extra calls ignored). Most robust for LLM agents."""
    return set(expected) <= set(actual)


def in_order(actual: list[str], expected: list[str]) -> bool:
    """Expected tools appear in this order (other calls may be interleaved)."""
    it = iter(actual)
    return all(e in it for e in expected)


if __name__ == "__main__":
    a = ["search_docs", "get_mission", "search_docs", "check_approval_policy"]
    assert subset(a, ["check_approval_policy", "search_docs"]) and not subset(a, ["get_crew"])
    assert in_order(a, ["search_docs", "check_approval_policy"]) and not in_order(a, ["check_approval_policy", "get_mission"])
    assert exact(["x"], ["x"]) and not exact(a, ["search_docs"])
    print("trajectory ok")
