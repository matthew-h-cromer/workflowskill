"""Shared plugin loader for toolkits and runtimes."""

from __future__ import annotations

import importlib
from typing import Any


def load_plugin(
    registry: dict[str, str],
    name: str,
    kind: str,
    factory_name: str,
    **factory_kwargs: Any,
) -> Any:
    """Load and instantiate a plugin by name from a registry.

    Args:
        registry:       Mapping of plugin name → module path.
        name:           Plugin name to load (e.g. ``"weldable"``).
        kind:           Human-readable category for error messages
                        (e.g. ``"toolkit"`` or ``"runtime"``).
        factory_name:   Name of the factory function in the module
                        (e.g. ``"create_toolkit"``).
        **factory_kwargs: Keyword arguments forwarded to the factory.

    Raises:
        ValueError:  If *name* is not in the registry.
    """
    if name not in registry:
        available = ", ".join(sorted(registry))
        raise ValueError(f"Unknown {kind}: {name!r}. Available: {available}")
    module = importlib.import_module(registry[name])
    factory = getattr(module, factory_name)
    return factory(**factory_kwargs)
