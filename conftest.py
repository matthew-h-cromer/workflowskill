"""Root conftest — options registered here are available to all test subdirectories."""

from __future__ import annotations

from typing import Any

from dotenv import load_dotenv

load_dotenv()


def pytest_addoption(parser: Any) -> None:
    parser.addoption(
        "--eval-snapshot",
        action="store_true",
        default=False,
        help="Save generated SKILL.md outputs to evals/snapshots/",
    )
