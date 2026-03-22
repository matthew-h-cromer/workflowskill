"""Unit tests for ActionRegistry."""

import pytest

from workflowskill.actions.registry import ActionRegistry


async def _double(args: dict) -> dict:
    return {"result": args["value"] * 2}


def _sync_triple(args: dict) -> dict:
    return {"result": args["value"] * 3}


class TestActionRegistry:
    def test_register_and_has(self) -> None:
        registry = ActionRegistry()
        assert not registry.has("double")
        registry.register("double", _double)
        assert registry.has("double")

    def test_names(self) -> None:
        registry = ActionRegistry()
        registry.register("a", _double)
        registry.register("b", _double)
        assert sorted(registry.names()) == ["a", "b"]

    def test_get_activities_returns_list(self) -> None:
        registry = ActionRegistry()
        registry.register("double", _double)
        activities = registry.get_activities()
        assert len(activities) == 1
        assert callable(activities[0])

    def test_duplicate_registration_raises(self) -> None:
        registry = ActionRegistry()
        registry.register("double", _double)
        with pytest.raises(ValueError, match="already registered"):
            registry.register("double", _double)

    def test_empty_registry(self) -> None:
        registry = ActionRegistry()
        assert registry.get_activities() == []
        assert registry.names() == []

    def test_sync_handler_registered(self) -> None:
        registry = ActionRegistry()
        registry.register("triple", _sync_triple)
        assert registry.has("triple")
        activities = registry.get_activities()
        assert len(activities) == 1

    def test_get_handler_returns_registered_handler(self) -> None:
        registry = ActionRegistry()
        registry.register("double", _double)
        assert registry.get_handler("double") is _double

    def test_get_handler_raises_for_unknown(self) -> None:
        registry = ActionRegistry()
        with pytest.raises(KeyError, match="nope"):
            registry.get_handler("nope")


class TestActionRegistryCallbacks:
    @pytest.mark.asyncio
    async def test_on_activity_start_called(self) -> None:
        started: list[str] = []
        registry = ActionRegistry(on_activity_start=started.append)
        registry.register("double", _double)

        # Call the wrapped activity directly (bypassing Temporal)
        activity_fn = registry.get_activities()[0]
        await activity_fn({"value": 5})

        assert started == ["double"]

    @pytest.mark.asyncio
    async def test_on_activity_complete_called(self) -> None:
        calls: list[tuple[str, int]] = []
        registry = ActionRegistry(on_activity_complete=lambda n, ms: calls.append((n, ms)))
        registry.register("double", _double)

        activity_fn = registry.get_activities()[0]
        await activity_fn({"value": 5})

        assert len(calls) == 1
        assert calls[0][0] == "double"
        assert isinstance(calls[0][1], int)

    @pytest.mark.asyncio
    async def test_on_activity_complete_called_on_error(self) -> None:
        async def _failing(args: dict) -> dict:
            raise RuntimeError("boom")

        calls: list[tuple[str, int]] = []
        registry = ActionRegistry(on_activity_complete=lambda n, ms: calls.append((n, ms)))
        registry.register("failing", _failing)

        activity_fn = registry.get_activities()[0]
        with pytest.raises(RuntimeError):
            await activity_fn({})

        assert len(calls) == 1
        assert calls[0][0] == "failing"
