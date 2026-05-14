def run(error_text: str) -> str:
    """Explain one common Python error so the MVP can demonstrate a local tool call."""
    if "unsupported operand type" in error_text:
        return (
            "The error usually means incompatible types were combined. "
            "Check whether an int was added to a str and normalize the values first."
        )
    return "No specific issue pattern matched in the demo scanner."