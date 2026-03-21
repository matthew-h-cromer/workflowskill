"""AST validator for SKILL.md workflow code blocks.

Validates method-body code (the body of the @workflow.run method).
Imports are auto-injected by the loader; class definitions, dangerous
operations (eval/exec, file I/O, subprocess) are blocked at load time.
"""

from __future__ import annotations

import ast
import textwrap

# Callable names that are never allowed
_BLOCKED_CALLABLES: set[str] = {
    "eval",
    "exec",
    "compile",
    "__import__",
    "open",
    "getattr",
    "setattr",
    "delattr",
    "globals",
    "locals",
    "vars",
    "breakpoint",
}

# Dunder attributes that are blocked (escape hatches)
_BLOCKED_DUNDERS: set[str] = {
    "__class__",
    "__subclasses__",
    "__bases__",
    "__mro__",
    "__dict__",
    "__builtins__",
    "__globals__",
    "__code__",
    "__closure__",
    "__import__",
    "__reduce__",
    "__reduce_ex__",
    "__getattribute__",
}

# AST node types that are allowed (whitelist)
_ALLOWED_NODE_TYPES: set[type] = {
    ast.AsyncFunctionDef,
    ast.FunctionDef,
    # Control flow
    ast.If,
    ast.For,
    ast.While,
    ast.Break,
    ast.Continue,
    ast.Return,
    ast.Pass,
    # Try/except
    ast.Try,
    ast.ExceptHandler,
    # Expressions
    ast.Await,
    ast.Call,
    ast.Attribute,
    ast.Name,
    ast.Subscript,
    ast.Constant,
    ast.JoinedStr,
    ast.FormattedValue,
    # Operators
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    # Operator types
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.FloorDiv,
    ast.Mod,
    ast.Pow,
    ast.USub,
    ast.UAdd,
    ast.Not,
    ast.And,
    ast.Or,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.In,
    ast.NotIn,
    ast.Is,
    ast.IsNot,
    # Collections
    ast.Dict,
    ast.List,
    ast.Tuple,
    ast.Set,
    ast.ListComp,
    ast.DictComp,
    ast.SetComp,
    ast.GeneratorExp,
    ast.comprehension,
    # Assignments
    ast.Assign,
    ast.AugAssign,
    ast.AnnAssign,
    # Misc
    ast.Expr,
    ast.Starred,
    ast.keyword,
    ast.arg,
    ast.arguments,
    ast.Load,
    ast.Store,
    ast.Del,
    ast.Index,
    ast.Slice,
    ast.Delete,
    # Python 3.10+
    ast.IfExp,
}

# Try to add TryStar (Python 3.11+) if available
_TryStar = getattr(ast, "TryStar", None)
if _TryStar is not None:
    _ALLOWED_NODE_TYPES.add(_TryStar)


class _WorkflowValidator(ast.NodeVisitor):
    """AST visitor that validates workflow method-body code."""

    def __init__(self, source_path: str, line_offset: int = 0) -> None:
        self.source_path = source_path
        self.errors: list[str] = []
        self._line_offset = line_offset

    def _err(self, node: ast.AST, msg: str) -> None:
        lineno = getattr(node, "lineno", "?")
        if isinstance(lineno, int):
            lineno = max(1, lineno - self._line_offset)
        self.errors.append(f"{self.source_path}:{lineno}: {msg}")

    def generic_visit(self, node: ast.AST) -> None:
        node_type = type(node)
        if node_type not in _ALLOWED_NODE_TYPES:
            self._err(node, f"Disallowed construct: {node_type.__name__}")
            return  # Don't recurse into disallowed nodes
        super().generic_visit(node)

    # --- Blocked: imports (auto-injected by the loader) ---

    def visit_Import(self, node: ast.Import) -> None:
        names = ", ".join(alias.name for alias in node.names)
        self._err(
            node,
            f"Imports are not allowed in workflow code — they are auto-injected: 'import {names}'",
        )

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        self._err(
            node,
            f"Imports are not allowed in workflow code — they are auto-injected: "
            f"'from {module} import ...'",
        )

    # --- Blocked: class definitions ---

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self._err(node, "Class definitions are not allowed in workflow code")

    # --- Blocked constructs ---

    def visit_With(self, node: ast.With) -> None:
        self._err(node, "'with' statements are not allowed in workflows")

    def visit_AsyncWith(self, node: ast.AsyncWith) -> None:
        self._err(node, "'async with' statements are not allowed in workflows")

    def visit_Global(self, node: ast.Global) -> None:
        self._err(node, "'global' statements are not allowed in workflows")

    def visit_Nonlocal(self, node: ast.Nonlocal) -> None:
        self._err(node, "'nonlocal' statements are not allowed in workflows")

    def visit_Lambda(self, node: ast.Lambda) -> None:
        self._err(node, "Lambda expressions are not allowed in workflows")

    def visit_AsyncFor(self, node: ast.AsyncFor) -> None:
        self._err(node, "'async for' is not allowed in workflows")

    # --- Call validation (blocked callables + dunder attributes) ---

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func
        if isinstance(func, ast.Name) and func.id in _BLOCKED_CALLABLES:
            self._err(node, f"Call to '{func.id}' is not allowed in workflows")
        elif isinstance(func, ast.Attribute) and func.attr in _BLOCKED_CALLABLES:
            self._err(node, f"Call to '.{func.attr}' is not allowed in workflows")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr in _BLOCKED_DUNDERS:
            self._err(node, f"Access to '{node.attr}' is not allowed in workflows")
        self.generic_visit(node)


def validate_workflow_code(code: str, source_path: str) -> list[str]:
    """Validate workflow method-body code against the restricted Python subset.

    The code is the body of the @workflow.run method — imports and class
    boilerplate are auto-injected by the loader and must not appear here.

    Args:
        code: Method-body Python source code from the SKILL.md code block.
        source_path: Path to the SKILL.md file (used in error messages).

    Returns:
        A list of error strings. Empty list means the code is valid.
    """
    body = code if code.strip() else "pass"
    # Wrap in an async function so return/await are syntactically valid
    wrapped = "async def _workflowskill_run():\n" + textwrap.indent(body, "    ")
    try:
        tree = ast.parse(wrapped)
    except SyntaxError as e:
        lineno = max(1, (e.lineno or 1) - 1)
        return [f"{source_path}:{lineno}: Syntax error: {e.msg}"]

    # Validate the function body (user code), adjusting line numbers by -1
    # to account for the wrapper line added above.
    func_def = tree.body[0]
    assert isinstance(func_def, ast.AsyncFunctionDef)
    validator = _WorkflowValidator(source_path=str(source_path), line_offset=1)
    for stmt in func_def.body:
        validator.visit(stmt)

    return validator.errors
