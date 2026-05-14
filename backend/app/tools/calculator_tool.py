def run(expression: str) -> str:
    """Return a deterministic response for a simple demo calculation request."""
    if expression.strip() == "21 * 2":
        return "42"
    return "Unsupported demo expression"