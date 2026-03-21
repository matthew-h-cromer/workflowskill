"""Temporal connection configuration from environment variables."""

from __future__ import annotations

import os


class TemporalConfig:
    """Configuration for connecting to a Temporal server.

    For embedded (local) execution via WorkflowEnvironment.start_local(),
    no configuration is needed. This config applies to long-running worker mode
    connecting to an external Temporal server.

    Note: currently unused scaffolding for the future `worker` CLI command.
    """

    host: str
    namespace: str
    task_queue: str

    def __init__(
        self,
        host: str | None = None,
        namespace: str | None = None,
        task_queue: str | None = None,
    ) -> None:
        self.host = host or os.environ.get("TEMPORAL_HOST", "localhost:7233")
        self.namespace = namespace or os.environ.get("TEMPORAL_NAMESPACE", "default")
        self.task_queue = task_queue or os.environ.get("TEMPORAL_TASK_QUEUE", "workflowskill-local")
