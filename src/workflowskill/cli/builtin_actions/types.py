"""I/O dataclasses for built-in CLI actions."""

from __future__ import annotations

from dataclasses import dataclass, field

# api

@dataclass
class ApiInput:
    url: str
    method: str = "GET"
    headers: dict[str, str] = field(default_factory=dict)
    body: str | None = None


@dataclass
class ApiOutput:
    content: str
    url: str
    content_type: str
    status: int


# scrape

@dataclass
class ScrapeInput:
    url: str
    selectors: dict[str, str | dict[str, str]]
    headers: dict[str, str] = field(default_factory=dict)


@dataclass
class ScrapeOutput:
    status: int
    results: dict[str, list[str]]


# llm

@dataclass
class LlmInput:
    prompt: str
    system: str | None = None
    schema: dict | None = None  # type: ignore[type-arg]
    model: str = "claude-sonnet-4-6"


@dataclass
class LlmOutput:
    result: object  # The parsed JSON object returned by the LLM
