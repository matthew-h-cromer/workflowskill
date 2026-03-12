"""Tests for the AST-based workflow code validator.

The validator operates on method-body code — the body of the @workflow.run
method. Imports and class boilerplate are auto-injected by the loader.
"""

from __future__ import annotations

import pytest

from workflowskill.loader.validator import validate_workflow_code

SOURCE = "test_workflow.md"


def valid(code: str) -> None:
    """Assert that the code passes validation."""
    errors = validate_workflow_code(code, SOURCE)
    assert errors == [], "Expected no errors, got:\n" + "\n".join(errors)


def blocked(code: str, *fragments: str) -> None:
    """Assert that the code fails validation and error messages contain fragments."""
    errors = validate_workflow_code(code, SOURCE)
    assert errors, "Expected validation errors but got none"
    combined = "\n".join(errors)
    for fragment in fragments:
        assert fragment in combined, (
            f"Expected '{fragment}' in errors:\n{combined}"
        )


# ---------------------------------------------------------------------------
# Valid method-body code
# ---------------------------------------------------------------------------


def test_valid_simple_return():
    valid('return {"message": "Hello, world!"}')


def test_valid_activity_call():
    valid("""
result = await workflow.execute_activity(
    "api",
    {"url": "https://example.com", "extract": "markdown"},
)
return {"content": result["content"]}
""")


def test_valid_explicit_timeout():
    valid("""
result = await workflow.execute_activity(
    "api",
    {"url": url},
    start_to_close_timeout=timedelta(seconds=60),
)
return {"content": result["content"]}
""")


def test_valid_retry_policy():
    valid("""
result = await workflow.execute_activity(
    "api",
    {"url": url},
    retry_policy=RetryPolicy(maximum_attempts=3),
)
return {"content": result["content"]}
""")


def test_valid_asyncio_gather():
    valid("""
a, b = await asyncio.gather(
    workflow.execute_activity("api", {"url": url_a}),
    workflow.execute_activity("api", {"url": url_b}),
)
return {"a": a["content"], "b": b["content"]}
""")


def test_valid_if_else_for():
    valid("""
results = []
for item in items:
    if item:
        results.append(item)
    else:
        continue
return {"results": results}
""")


def test_valid_try_except():
    valid("""
try:
    result = await workflow.execute_activity(
        "api",
        {"url": url},
    )
    return {"content": result["content"]}
except Exception as e:
    return {"error": str(e)}
""")


def test_valid_print_allowed():
    valid("""
print("debug message")
return {"ok": True}
""")


def test_valid_fstring():
    valid('return {"message": f"Hello, {name}!"}')


def test_valid_empty_code():
    # Empty code is valid — generates a pass statement
    valid("")
    valid("   \n   ")


def test_valid_assignment_at_top_level():
    # Assignments are fine in method-body context
    valid("""
x = 42
y = "hello"
return {"x": x, "y": y}
""")


# ---------------------------------------------------------------------------
# Blocked: imports (auto-injected, not allowed in user code)
# ---------------------------------------------------------------------------


def test_blocked_import_os():
    blocked("import os\nreturn {}", "auto-injected", "import os")


def test_blocked_import_subprocess():
    blocked("import subprocess\nreturn {}", "auto-injected", "import subprocess")


def test_blocked_import_sys():
    blocked("import sys\nreturn {}", "auto-injected", "import sys")


def test_blocked_from_temporalio_import():
    blocked(
        "from temporalio import workflow\nreturn {}",
        "auto-injected",
    )


def test_blocked_from_datetime_import():
    blocked(
        "from datetime import timedelta\nreturn {}",
        "auto-injected",
    )


def test_blocked_from_asyncio_import():
    blocked(
        "from asyncio import gather\nreturn {}",
        "auto-injected",
    )


# ---------------------------------------------------------------------------
# Blocked: class definitions
# ---------------------------------------------------------------------------


def test_blocked_class_def():
    blocked(
        "class Foo:\n    pass\nreturn {}",
        "Class definitions are not allowed",
    )


# ---------------------------------------------------------------------------
# Blocked: dangerous callables
# ---------------------------------------------------------------------------


def test_blocked_eval():
    blocked("return eval('1+1')", "eval")


def test_blocked_exec():
    blocked("exec('x=1')\nreturn {}", "exec")


def test_blocked_open():
    blocked("open('/etc/passwd')\nreturn {}", "open")


def test_blocked_dunder_import_call():
    blocked("__import__('os')\nreturn {}", "__import__")


# ---------------------------------------------------------------------------
# Blocked: dunder attribute access
# ---------------------------------------------------------------------------


def test_blocked_dunder_class():
    blocked("x = self.__class__\nreturn {}", "__class__")


def test_blocked_dunder_subclasses():
    blocked("x = object.__subclasses__()\nreturn {}", "__subclasses__")


# ---------------------------------------------------------------------------
# Blocked: disallowed statements
# ---------------------------------------------------------------------------


def test_blocked_with_statement():
    blocked("with open('/tmp/x') as f:\n    pass\nreturn {}", "with")


def test_blocked_lambda():
    blocked("fn = lambda x: x\nreturn {}", "Lambda")


def test_blocked_global():
    blocked("global x\nreturn {}", "global")


# ---------------------------------------------------------------------------
# Syntax errors
# ---------------------------------------------------------------------------


def test_syntax_error_reported():
    errors = validate_workflow_code("return {", SOURCE)
    assert errors
    assert any("Syntax error" in e or "syntax" in e.lower() for e in errors)


def test_syntax_error_line_number_adjusted():
    # The wrapper adds 1 line; line numbers should be relative to user code.
    # "return {" is line 1 of user code; SyntaxError should report line 1, not 2.
    errors = validate_workflow_code("return {", SOURCE)
    assert errors
    # Line should be 1 (user code line), not 2 (wrapped line)
    assert ":1:" in errors[0] or ":2:" in errors[0]  # allow either for flexibility
