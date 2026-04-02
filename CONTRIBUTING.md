# Contributing

WorkflowSkill has two extension points: **toolkits** (action execution) and **runtimes** (workflow orchestration). To support WorkflowSkill, a platform implements both. They are independent — any toolkit works with any runtime.

---

## Toolkits

A toolkit connects workflows to a platform's action execution layer. When workflow code calls `workflow.execute_activity("slack.post_message", {...})`, the toolkit receives that call and routes it to the right place — a cloud API, an SDK, a local process, whatever the platform provides.

### What a toolkit provides

1. **Action execution** — an `execute(action, args)` method that handles any action name the workflow calls.
2. **Authoring context** — a `prompt.md` document injected into Claude's context when authoring workflows for this toolkit. Describes available action names, required arguments, and response shapes.

### Implement the Toolkit protocol

Create `cli/workflowskill/toolkits/{name}/__init__.py`:

```python
from __future__ import annotations
from pathlib import Path
from typing import Any


class MyPlatformToolkit:
    name = "myplatform"
    description = "My platform — short description"
    homepage = "https://myplatform.example"

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def execute(self, action: str, args: dict[str, Any]) -> dict[str, Any]:
        # Route the action name to the right API call.
        # Raise KeyError if the action is not supported.
        # Raise RuntimeError if the action fails.
        response = await self._call_api(action, args)
        return response

    def get_authoring_context(self) -> str:
        return (Path(__file__).parent / "prompt.md").read_text()


def create_toolkit() -> MyPlatformToolkit:
    """Factory called by load_toolkit(). Read config from environment here."""
    import os
    api_key = os.environ.get("MYPLATFORM_API_KEY")
    if not api_key:
        raise RuntimeError("MYPLATFORM_API_KEY is required.")
    return MyPlatformToolkit(api_key=api_key)
```

Two patterns for `execute()`:

**Catch-all** (the platform handles routing):
```python
async def execute(self, action: str, args: dict[str, Any]) -> dict[str, Any]:
    resp = await self._client.post("/act", json={"intent": action, "args": args})
    return resp.json()["result"]
```

**Fixed action set** (the toolkit routes internally):
```python
async def execute(self, action: str, args: dict[str, Any]) -> dict[str, Any]:
    match action:
        case "stripe.create_customer":
            return await self._create_customer(args)
        case "stripe.list_charges":
            return await self._list_charges(args)
        case _:
            raise KeyError(f"Unknown action: {action!r}")
```

### Register the toolkit

Add it to `_REGISTRY` in `cli/workflowskill/toolkits/__init__.py`:

```python
_REGISTRY: dict[str, str] = {
    "weldable": "workflowskill.toolkits.weldable",
    "myplatform": "workflowskill.toolkits.myplatform",
}
```

### Write prompt.md

`cli/workflowskill/toolkits/{name}/prompt.md` is injected into Claude when authoring workflows with `--toolkit myplatform`. Document:

- Available action names and their exact format (e.g. `myplatform.do_thing`)
- Required and optional arguments for each action
- Response shapes
- Authentication requirements and how to connect services

See `cli/workflowskill/toolkits/weldable/prompt.md` for an example.

### Support `workflowskill login` (optional)

If your toolkit needs an API key or OAuth token, you can add browser-based login support so users run `workflowskill login --toolkit myplatform` instead of setting environment variables by hand.

**1. Register your toolkit name** in the `--toolkit` option in `cli/workflowskill/main.py`:

```python
@click.option(
    "--toolkit",
    required=True,
    type=click.Choice(["weldable", "myplatform"]),
    ...
)
```

**2. Implement a `login_myplatform` function** in `cli/workflowskill/auth.py`. It receives the API base URL and the path to `.env`, runs the auth flow, and writes credentials there. See `login_weldable` for a complete reference implementation — it opens a browser to your authorization endpoint, waits for a callback on a local HTTP server, validates a CSRF state token, and calls `_save_to_env` to write the key.

**3. Dispatch it** in the `login` command body in `main.py`:

```python
elif toolkit == "myplatform":
    from workflowskill.auth import login_myplatform
    login_myplatform(api_url, env_path)
```

The PR checklist for toolkits with login support:
- `login_myplatform` added to `auth.py`
- Toolkit name added to the `--toolkit` Choice in `main.py`
- Login dispatched in the `login` command
- Flow tested end-to-end: browser opens, key writes to `.env`, re-running prompts before overwriting

### Add examples

Create `examples/myplatform/` with at least one runnable end-to-end example.

### Write tests

Verify Protocol compliance and action routing:

```python
from workflowskill.toolkits._protocol import Toolkit

def test_implements_protocol():
    toolkit = MyPlatformToolkit(api_key="test")
    assert isinstance(toolkit, Toolkit)

async def test_execute_routes_correctly():
    toolkit = MyPlatformToolkit(api_key="test")
    # mock the underlying HTTP/SDK call and verify routing
    ...
```

### Submit a PR

PRs are reviewed for:

- `execute()` implemented and reachable
- `create_toolkit()` factory exported at module level
- `prompt.md` documents available actions with parameter names and shapes
- At least one runnable example in `examples/`
- Tests: Protocol compliance, action routing, missing-config error

No changes to core infrastructure (loader, runner, `skill/SKILL.md`, evals) are needed or expected.

---

## Runtimes

A runtime provides the orchestration layer for workflow execution. It decides how a workflow runs — whether steps are checkpointed, how crashes are recovered, how retries work, and how signals (pause/resume) are implemented.

Runtimes receive a toolkit at construction and call `toolkit.execute()` inside each step. The workflow code is unaware of both.

### What a runtime provides

1. **`run_workflow(workflow_fn, inputs, *, workflow_id)`** — execute a workflow function with whatever durability guarantees the platform offers.
2. **`execute_step(action, args, *, timeout, retry_policy)`** — execute a single action as a checkpointed step. On crash recovery, completed steps return cached results.
3. **`wait_for_signal(name, *, prompt, timeout)`** — pause the workflow and wait for an external event.

### Implement the Runtime protocol

Create `cli/workflowskill/runtimes/{name}.py`:

```python
from __future__ import annotations
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

import workflowskill.workflow_context as _wf_ctx
from workflowskill.toolkits._protocol import Toolkit


class MyRuntime:
    name = "myruntime"

    def __init__(
        self,
        toolkit: Toolkit | None = None,
        on_activity_start: Callable | None = None,
        on_activity_complete: Callable | None = None,
        on_signal_waiting: Callable | None = None,
    ) -> None:
        self._toolkit = toolkit
        self._on_activity_start = on_activity_start
        self._on_activity_complete = on_activity_complete
        self._on_signal_waiting = on_signal_waiting

    async def run_workflow(
        self,
        workflow_fn: Callable[..., Awaitable[dict[str, Any]]],
        inputs: dict[str, Any],
        *,
        workflow_id: str | None = None,
    ) -> dict[str, Any]:
        # Set the ContextVar so execute_activity() routes here.
        token = _wf_ctx.set_context(self._dispatch, self._signal)
        try:
            return await workflow_fn(**inputs)
        finally:
            _wf_ctx.reset_context(token)

    async def _dispatch(
        self, action: str, args: dict, step_index: int, display_label: str
    ) -> dict:
        # Wrap execute_step with lifecycle callbacks for display.
        import time
        if self._on_activity_start:
            self._on_activity_start(action, args)
        t0 = time.monotonic()
        try:
            return await self.execute_step(action, args)
        finally:
            if self._on_activity_complete:
                self._on_activity_complete(action, int((time.monotonic() - t0) * 1000))

    async def execute_step(
        self,
        action: str,
        args: dict[str, Any],
        *,
        timeout: timedelta | None = None,
        retry_policy: Any | None = None,
    ) -> dict[str, Any]:
        if self._toolkit is None:
            raise RuntimeError(f"Action '{action}' called but no toolkit configured.")
        # Wrap with your platform's checkpointing here.
        return await self._toolkit.execute(action, args)

    async def _signal(self, name: str, prompt: str | None, timeout: Any) -> Any:
        td = timeout if isinstance(timeout, timedelta) else (
            timedelta(seconds=float(timeout)) if timeout is not None else None
        )
        return await self.wait_for_signal(name, prompt=prompt, timeout=td)

    async def wait_for_signal(
        self,
        name: str,
        *,
        prompt: str | None = None,
        timeout: timedelta | None = None,
    ) -> Any:
        # Implement platform-specific pause/resume.
        ...


def create_runtime(
    toolkit: Toolkit | None = None,
    on_activity_start: Callable | None = None,
    on_activity_complete: Callable | None = None,
    on_signal_waiting: Callable | None = None,
) -> MyRuntime:
    return MyRuntime(
        toolkit=toolkit,
        on_activity_start=on_activity_start,
        on_activity_complete=on_activity_complete,
        on_signal_waiting=on_signal_waiting,
    )
```

### Key implementation notes

**`workflow_id`** is the SKILL.md file path. Durable runtimes use it as the checkpoint key so crash recovery can reload the workflow class from disk rather than serializing the function. Non-durable runtimes can ignore it.

**ContextVar wiring** is how the workflow code reaches your runtime. `_wf_ctx.set_context(dispatch, signal)` installs two functions into ContextVars that the generated workflow module calls when it hits `workflow.execute_activity()` or `workflow.wait_for_signal()`. Always call `reset_context(token)` in a `finally` block.

**Lifecycle callbacks** (`on_activity_start`, `on_activity_complete`) are display concerns — they drive the CLI spinner. Wire them in `_dispatch`, not in `execute_step`, so they fire regardless of how the step is checkpointed.

**Durable runtimes** need the step to be the atomic unit. Call `toolkit.execute()` inside your platform's checkpointing primitive (a DBOS step, a Temporal activity, an Inngest step function). The checkpoint must wrap the execution — not follow it — to guarantee exactly-once semantics.

### Register the runtime

Add it to `_REGISTRY` in `cli/workflowskill/runtimes/__init__.py`:

```python
_REGISTRY: dict[str, str] = {
    "dbos": "workflowskill.runtimes.dbos",
    "myruntime": "workflowskill.runtimes.myruntime",
}
```

### Write tests

Verify Protocol compliance and the ContextVar wiring:

```python
from workflowskill.runtimes._protocol import Runtime

def test_implements_protocol():
    runtime = MyRuntime()
    assert isinstance(runtime, Runtime)

async def test_execute_activity_routes_to_toolkit():
    mock_toolkit = AsyncMock()
    mock_toolkit.execute = AsyncMock(return_value={"ok": True})
    runtime = MyRuntime(toolkit=mock_toolkit)

    async def workflow() -> dict:
        import workflowskill.workflow_context as ctx
        return await ctx.dispatch_action("my.action", {"x": 1}, 0, "my.action")

    result = await runtime.run_workflow(workflow, {})
    assert result == {"ok": True}
    mock_toolkit.execute.assert_called_once_with("my.action", {"x": 1})
```

### Submit a PR

PRs are reviewed for:

- `run_workflow()`, `execute_step()`, `wait_for_signal()` implemented
- `create_runtime()` factory exported at module level
- ContextVar wiring: `set_context` called in `run_workflow`, `reset_context` in `finally`
- Lifecycle callbacks wired through `_dispatch`
- Tests: Protocol compliance, ContextVar integration, toolkit dispatch

No changes to core infrastructure (loader, `skill/SKILL.md`, evals) are needed or expected.

---

## Governance

- **Core infrastructure** (`skill/SKILL.md`, loader, evals) is maintained by the workflowskill team. Changes here require a proposal and review.
- **Toolkits and runtimes** are maintained by their respective platform teams. Breaking changes to core require maintainer notification.
- Authors who know workflowskill can write workflows for your platform immediately, using the same authoring experience and eval suite.
