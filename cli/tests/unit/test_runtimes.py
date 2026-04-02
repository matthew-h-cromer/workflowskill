"""Unit tests for the runtime system."""

from __future__ import annotations

import pytest

from workflowskill.runtimes._protocol import Runtime


# ── Runtime loader ────────────────────────────────────────────────────────────


class TestRuntimeLoader:
    def test_load_dbos(self) -> None:
        from workflowskill.runtimes import load_runtime

        runtime = load_runtime("dbos")
        assert runtime.name == "dbos"

    def test_load_unknown_raises(self) -> None:
        from workflowskill.runtimes import load_runtime

        with pytest.raises(ValueError, match="Unknown runtime"):
            load_runtime("nonexistent")

    def test_available_runtimes(self) -> None:
        from workflowskill.runtimes import available_runtimes

        runtimes = available_runtimes()
        assert "dbos" in runtimes


# ── DBOSRuntime Protocol compliance ──────────────────────────────────────────


class TestDBOSRuntimeProtocol:
    def test_implements_runtime_protocol(self) -> None:
        from workflowskill.runtimes.dbos import DBOSRuntime

        runtime = DBOSRuntime()
        assert isinstance(runtime, Runtime)

    def test_name(self) -> None:
        from workflowskill.runtimes.dbos import DBOSRuntime

        assert DBOSRuntime().name == "dbos"

    @pytest.mark.asyncio
    async def test_run_workflow_requires_workflow_id(self) -> None:
        from workflowskill.runtimes.dbos import DBOSRuntime

        runtime = DBOSRuntime()

        async def dummy_fn() -> dict:
            return {}

        with pytest.raises(ValueError, match="requires workflow_id"):
            await runtime.run_workflow(dummy_fn, {})  # type: ignore[arg-type]
