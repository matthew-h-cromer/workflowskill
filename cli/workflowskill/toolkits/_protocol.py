"""Toolkit protocol — defines the interface all toolkits must implement."""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class Toolkit(Protocol):
    """A platform-specific integration that connects workflows to external services.

    Each toolkit implements a single method — ``execute()`` — that receives an
    action name and arguments and returns a result dict. The runtime calls this
    method for each ``workflow.execute_activity()`` call.

    Toolkit authors do not need to know about the runtime or how durability
    works — that is entirely the runtime's concern.

    Example::

        class MyPlatformToolkit:
            name = "myplatform"
            description = "My platform integration"
            homepage = "https://myplatform.example"

            async def execute(self, action: str, args: dict) -> dict:
                # route action name to the right API call
                response = await self._client.call(action, **args)
                return response.to_dict()

            def get_authoring_context(self) -> str:
                return (Path(__file__).parent / "prompt.md").read_text()
    """

    name: str
    description: str
    homepage: str

    async def execute(self, action: str, args: dict[str, Any]) -> dict[str, Any]:
        """Execute a named action with the given arguments.

        Args:
            action: The action name from ``workflow.execute_activity()``,
                    e.g. ``"slack.post_message"`` or ``"stripe.create_charge"``.
            args:   The arguments dict passed to ``execute_activity()``.

        Returns:
            A dict result that is returned to the workflow.

        Raises:
            KeyError: If the action is not supported by this toolkit.
            RuntimeError: If the action fails (auth error, API error, etc.).
        """
        ...

    def get_authoring_context(self) -> str:
        """Return markdown describing available actions for LLM authoring context.

        This string is injected into the system prompt when Claude generates
        workflows for this toolkit. Describe available action names, required
        arguments, and response shapes.
        """
        ...
