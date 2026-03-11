"""Reusable AST assertion helpers for eval tests.

Each function wraps code in an async function, parses it, and walks the AST
to check for structural patterns. Follows patterns from
src/workflowskill/loader/validator.py.
"""

from __future__ import annotations

import ast
import textwrap


def _parse(code: str) -> ast.Module:
    """Wrap code in an async function and parse it."""
    wrapped = "async def _():\n" + textwrap.indent(code, "    ")
    return ast.parse(wrapped)


def _func_body(tree: ast.Module) -> list[ast.stmt]:
    func = tree.body[0]
    assert isinstance(func, ast.AsyncFunctionDef)
    return func.body


def _is_execute_activity_call(node: ast.AST) -> bool:
    """Return True if node is a workflow.execute_activity(...) call."""
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr == "execute_activity"
        and isinstance(func.value, ast.Name)
        and func.value.id == "workflow"
    )


def _all_calls(tree: ast.Module) -> list[ast.Call]:
    return [n for n in ast.walk(tree) if isinstance(n, ast.Call)]


def has_execute_activity(code: str) -> bool:
    """Return True if the code contains any workflow.execute_activity() call."""
    tree = _parse(code)
    return any(_is_execute_activity_call(n) for n in ast.walk(tree))


def count_execute_activity(code: str) -> int:
    """Return the number of workflow.execute_activity() calls in the code."""
    tree = _parse(code)
    return sum(1 for n in ast.walk(tree) if _is_execute_activity_call(n))


def has_activity_named(code: str, name: str) -> bool:
    """Return True if there is an execute_activity call with `name` as the first argument."""
    tree = _parse(code)
    for node in ast.walk(tree):
        if _is_execute_activity_call(node):
            assert isinstance(node, ast.Call)
            if node.args and isinstance(node.args[0], ast.Constant):
                if node.args[0].value == name:
                    return True
    return False


def has_asyncio_gather(code: str) -> bool:
    """Return True if the code contains an asyncio.gather(...) call."""
    tree = _parse(code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if (
                isinstance(func, ast.Attribute)
                and func.attr == "gather"
                and isinstance(func.value, ast.Name)
                and func.value.id == "asyncio"
            ):
                return True
    return False


def has_for_loop(code: str) -> bool:
    """Return True if the code contains a for loop."""
    tree = _parse(code)
    return any(isinstance(n, ast.For) for n in ast.walk(tree))


def has_if_branch(code: str) -> bool:
    """Return True if the code contains an if statement."""
    tree = _parse(code)
    return any(isinstance(n, ast.If) for n in ast.walk(tree))


def has_try_except(code: str) -> bool:
    """Return True if the code contains a try/except block."""
    tree = _parse(code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Try) and node.handlers:
            return True
    return False


def has_retry_policy(code: str) -> bool:
    """Return True if the code contains a RetryPolicy(...) call."""
    tree = _parse(code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id == "RetryPolicy":
                return True
    return False


def has_retry_policy_keyword(code: str, keyword: str) -> bool:
    """Return True if a RetryPolicy call has a specific keyword argument."""
    tree = _parse(code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id == "RetryPolicy":
                if any(kw.arg == keyword for kw in node.keywords):
                    return True
    return False


def has_explicit_timeout(code: str) -> bool:
    """Return True if any execute_activity call has a start_to_close_timeout keyword arg."""
    tree = _parse(code)
    for node in ast.walk(tree):
        if _is_execute_activity_call(node):
            assert isinstance(node, ast.Call)
            if any(kw.arg == "start_to_close_timeout" for kw in node.keywords):
                return True
    return False


def has_schema_arg(code: str) -> bool:
    """Return True if any activity call dict arg contains a 'schema' key."""
    tree = _parse(code)
    for node in ast.walk(tree):
        if _is_execute_activity_call(node):
            assert isinstance(node, ast.Call)
            # Second arg is the args dict
            if len(node.args) >= 2:
                arg_dict = node.args[1]
                if isinstance(arg_dict, ast.Dict):
                    for key in arg_dict.keys:
                        if isinstance(key, ast.Constant) and key.value == "schema":
                            return True
    return False


def has_list_comprehension(code: str) -> bool:
    """Return True if the code contains a list comprehension."""
    tree = _parse(code)
    return any(isinstance(n, ast.ListComp) for n in ast.walk(tree))


def has_nested_dict_in_activity_args(code: str) -> bool:
    """Return True if any activity's args dict contains a nested dict value."""
    tree = _parse(code)
    for node in ast.walk(tree):
        if _is_execute_activity_call(node):
            assert isinstance(node, ast.Call)
            if len(node.args) >= 2:
                arg_dict = node.args[1]
                if isinstance(arg_dict, ast.Dict):
                    for value in arg_dict.values:
                        if isinstance(value, ast.Dict):
                            return True
    return False


def has_web_scrape_feeding_llm(code: str) -> bool:
    """Return True if a web_scrape call appears before an llm call in statement order.

    Checks the top-level statement list of the async function body. A web_scrape
    call must appear (by statement index) before an llm call.
    """
    tree = _parse(code)
    stmts = _func_body(tree)

    def _first_index_of_activity(name: str) -> int | None:
        for i, stmt in enumerate(stmts):
            for node in ast.walk(stmt):
                if _is_execute_activity_call(node):
                    assert isinstance(node, ast.Call)
                    if node.args and isinstance(node.args[0], ast.Constant):
                        if node.args[0].value == name:
                            return i
        return None

    scrape_idx = _first_index_of_activity("web_scrape")
    llm_idx = _first_index_of_activity("llm")
    if scrape_idx is None or llm_idx is None:
        return False
    return scrape_idx < llm_idx


def activity_inside_node(code: str, node_type: type) -> bool:
    """Return True if any execute_activity call is nested inside a node of node_type."""
    tree = _parse(code)

    def _contains_activity(node: ast.AST) -> bool:
        return any(_is_execute_activity_call(n) for n in ast.walk(node))

    for node in ast.walk(tree):
        if isinstance(node, node_type):
            if _contains_activity(node):
                return True
    return False
