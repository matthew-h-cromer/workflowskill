"""Eval tests: given a task description, does Claude generate a correct SKILL.md?

Each test targets a specific language feature. Run with:
    uv run pytest -m eval -v
"""

from __future__ import annotations

import ast
import os

import pytest
from evals.ast_checks import (
    activity_inside_node,
    count_execute_activity,
    has_activity_named,
    has_asyncio_gather,
    has_execute_activity,
    has_explicit_timeout,
    has_for_loop,
    has_if_branch,
    has_list_comprehension,
    has_nested_dict_in_activity_args,
    has_retry_policy,
    has_retry_policy_keyword,
    has_schema_arg,
    has_scrape_feeding_llm,
    has_try_except,
    has_wait_for_signal,
    has_wait_for_signal_with_timeout,
)

pytestmark = pytest.mark.eval

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EVAL_RETRIES = int(os.environ.get("EVAL_RETRIES", "1"))


async def _generate_with_retries(
    generate_skill: object, task: str, toolpack: str | None = None
) -> str:
    """Generate once (or N times if EVAL_RETRIES > 1, returning the last result)."""
    assert callable(generate_skill)
    last = await generate_skill(task, toolpack=toolpack)
    for _ in range(_EVAL_RETRIES - 1):
        last = await generate_skill(task, toolpack=toolpack)
    return last


# ---------------------------------------------------------------------------
# Test 1: Pure logic — no activities needed
# ---------------------------------------------------------------------------


async def test_pure_logic(generate_skill, parse_skill, extract_code, save_snapshot):
    """A simple greeting workflow with no external services should not call any activity."""
    TASK = (
        "Create a workflow named 'greet' that takes a 'name' string input "
        "and returns a greeting dict like {'greeting': 'Hello, <name>!'}. "
        "No external services are needed."
    )
    content = await _generate_with_retries(generate_skill, TASK)
    save_snapshot(content)

    skill = parse_skill(content)
    code = extract_code(content)

    assert "name" in skill.inputs, (
        f"Expected 'name' in inputs, got: {list(skill.inputs)}\n\nGenerated:\n{content}"
    )
    assert not has_execute_activity(code), (
        f"Pure-logic workflow should not call execute_activity\n\nGenerated code:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 2: Single activity — api
# ---------------------------------------------------------------------------


async def test_single_activity(generate_skill, parse_skill, extract_code, save_snapshot):
    """A fetch-URL workflow should call exactly one activity named 'api'."""
    TASK = (
        "Create a workflow named 'check-status' that takes a 'url' string input, "
        "calls the api action to fetch that URL, and returns the status code and content."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert count_execute_activity(code) == 1, (
        f"Expected exactly 1 activity call, got {count_execute_activity(code)}\n\nCode:\n{code}"
    )
    assert has_activity_named(code, "api"), (
        f"Expected activity named 'api'\n\nCode:\n{code}"
    )
    assert not has_explicit_timeout(code), (
        f"Simple api call should use default timeout, not explicit"
        f" start_to_close_timeout\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 3: Explicit timeout
# ---------------------------------------------------------------------------


async def test_explicit_timeout(generate_skill, parse_skill, extract_code, save_snapshot):
    """An LLM call with a long expected duration should use an explicit timeout."""
    TASK = (
        "Create a workflow named 'analyze-document' that takes a 'text' string input, "
        "calls the llm action to analyze it, and returns the result. "
        "The LLM call may take up to 120 seconds."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_activity_named(code, "llm"), (
        f"Expected activity named 'llm'\n\nCode:\n{code}"
    )
    assert has_explicit_timeout(code), (
        f"Expected start_to_close_timeout set explicitly for a 120s task\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 4: Sequential pipeline
# ---------------------------------------------------------------------------


async def test_sequential_pipeline(generate_skill, parse_skill, extract_code, save_snapshot):
    """Scrape then summarize should use two activities sequentially, not in parallel."""
    TASK = (
        "Create a workflow named 'scrape-and-summarize' that takes a 'url' string input, "
        "first scrapes the URL with scrape (extract h1 headings and article paragraphs), "
        "then summarizes the content using the llm action, "
        "and returns the summary. Steps must run in order."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert count_execute_activity(code) >= 2, (
        f"Expected ≥2 activity calls, got {count_execute_activity(code)}\n\nCode:\n{code}"
    )
    assert has_activity_named(code, "scrape"), (
        f"Expected scrape activity\n\nCode:\n{code}"
    )
    assert has_activity_named(code, "llm"), (
        f"Expected llm activity\n\nCode:\n{code}"
    )
    assert not has_asyncio_gather(code), (
        f"Sequential pipeline should not use asyncio.gather\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 5: Parallel execution
# ---------------------------------------------------------------------------


async def test_parallel_execution(generate_skill, parse_skill, extract_code, save_snapshot):
    """Calling two API endpoints concurrently should use asyncio.gather."""
    TASK = (
        "Create a workflow named 'fetch-two' that takes 'url_a' and 'url_b' string inputs, "
        "calls both URLs concurrently using the api action, and returns both results. "
        "The two calls must run in parallel."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    skill = parse_skill(content)
    code = extract_code(content)

    assert "url_a" in skill.inputs, (
        f"Expected 'url_a' input, got: {list(skill.inputs)}\n\nGenerated:\n{content}"
    )
    assert "url_b" in skill.inputs, (
        f"Expected 'url_b' input, got: {list(skill.inputs)}\n\nGenerated:\n{content}"
    )
    assert has_asyncio_gather(code), (
        f"Expected asyncio.gather for parallel fetches\n\nCode:\n{code}"
    )
    assert count_execute_activity(code) >= 2, (
        f"Expected ≥2 activity calls, got {count_execute_activity(code)}\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 6: Conditional logic
# ---------------------------------------------------------------------------


async def test_conditional_logic(generate_skill, parse_skill, extract_code, save_snapshot):
    """A workflow branching on HTTP status code should use the api action and an if statement."""
    TASK = (
        "Create a workflow named 'check-url' that takes a 'url' string input. "
        "Use the api action to get the response, then check the status field. "
        "If the status code is 200, return {'status': 'ok'}. "
        "Otherwise return {'status': 'error', 'code': <status_code>}."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_activity_named(code, "api"), (
        f"Expected api activity\n\nCode:\n{code}"
    )
    assert has_if_branch(code), (
        f"Expected if statement for status code branching\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 7: Loop handling
# ---------------------------------------------------------------------------


async def test_loop_handling(generate_skill, parse_skill, extract_code, save_snapshot):
    """Scraping a list of URLs should use a for loop with activity inside."""
    TASK = (
        "Create a workflow named 'scrape-urls' that takes a 'urls' list input. "
        "Loop over each URL and call scrape on it. "
        "Return a list of all scraped results."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_for_loop(code), (
        f"Expected for loop to iterate over URLs\n\nCode:\n{code}"
    )
    assert activity_inside_node(code, ast.For), (
        f"Expected execute_activity call inside the for loop body\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 8: Retry policy
# ---------------------------------------------------------------------------


async def test_retry_policy(generate_skill, parse_skill, extract_code, save_snapshot):
    """An api call with explicit retry config should use RetryPolicy with maximum_attempts."""
    TASK = (
        "Create a workflow named 'retry-fetch' that takes a 'url' string input. "
        "Call the url using the api action with a RetryPolicy of maximum_attempts=3, "
        "backoff_coefficient=2.0, and initial_interval of 2 seconds. Return the result."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_activity_named(code, "api"), (
        f"Expected api activity\n\nCode:\n{code}"
    )
    assert has_retry_policy(code), (
        f"Expected RetryPolicy(...) call\n\nCode:\n{code}"
    )
    assert has_retry_policy_keyword(code, "maximum_attempts"), (
        f"Expected maximum_attempts keyword in RetryPolicy\n\nCode:\n{code}"
    )
    assert has_retry_policy_keyword(code, "backoff_coefficient"), (
        f"Expected backoff_coefficient keyword in RetryPolicy\n\nCode:\n{code}"
    )
    assert has_retry_policy_keyword(code, "initial_interval"), (
        f"Expected initial_interval keyword in RetryPolicy\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 9: Error recovery
# ---------------------------------------------------------------------------


async def test_error_recovery(generate_skill, parse_skill, extract_code, save_snapshot):
    """A workflow with try/except around an api call should have proper error handling."""
    TASK = (
        "Create a workflow named 'safe-fetch' that takes a 'url' string input. "
        "Try to call the URL using the api action. If an exception occurs, return "
        "{'success': False, 'error': str(e)}. On success, return"
        " {'success': True, 'content': <content>}."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_try_except(code), (
        f"Expected try/except block\n\nCode:\n{code}"
    )
    assert activity_inside_node(code, ast.Try), (
        f"Expected execute_activity inside the try block\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 10: LLM with JSON schema
# ---------------------------------------------------------------------------


async def test_llm_with_schema(generate_skill, parse_skill, extract_code, save_snapshot):
    """An LLM call with a JSON schema constraint should pass 'schema' in the args dict."""
    TASK = (
        "Create a workflow named 'extract-info' that takes a 'text' string input. "
        "Call the llm action with a JSON schema constraint requiring the response to have "
        "fields 'title' (string) and 'summary' (string). Return the structured result."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_activity_named(code, "llm"), (
        f"Expected llm activity\n\nCode:\n{code}"
    )
    assert has_schema_arg(code), (
        f"Expected 'schema' key in llm activity args dict\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 11: Deterministic transform — scrape + Python, no llm
# ---------------------------------------------------------------------------


async def test_deterministic_transform(generate_skill, parse_skill, extract_code, save_snapshot):
    """Counting headings is deterministic — must use scrape + Python, not llm."""
    TASK = (
        "Create a workflow named 'count-headings' that takes a 'url' string input. "
        "Use scrape to extract all h2 headings from the page. "
        "Return a dict with 'count' (the number of headings found) and "
        "'headings' (the list of heading texts). "
        "This is pure data extraction — do not use the llm action."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_activity_named(code, "scrape"), (
        f"Expected scrape activity\n\nCode:\n{code}"
    )
    assert not has_activity_named(code, "llm"), (
        f"Deterministic extraction should not use llm\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 12: Deterministic pipeline — scrape + Python filter, no llm
# ---------------------------------------------------------------------------


async def test_deterministic_pipeline(generate_skill, parse_skill, extract_code, save_snapshot):
    """Filtering links by prefix is deterministic — must use scrape + Python, not llm."""
    TASK = (
        "Create a workflow named 'filter-links' that takes a 'url' string input "
        "and a 'prefix' string input (default 'https'). "
        "Use scrape with an object-form selector to extract href attributes from all anchor tags. "
        "Filter the list in pure Python to only include links starting with the prefix. "
        "Return the filtered list. Do not use the llm action."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_activity_named(code, "scrape"), (
        f"Expected scrape activity\n\nCode:\n{code}"
    )
    assert not has_activity_named(code, "llm"), (
        f"Deterministic filtering should not use llm\n\nCode:\n{code}"
    )
    assert has_for_loop(code) or has_list_comprehension(code), (
        f"Expected for loop or list comprehension for filtering\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 13: Outputs frontmatter
# ---------------------------------------------------------------------------


async def test_outputs_frontmatter(generate_skill, parse_skill, extract_code, save_snapshot):
    """A workflow that classifies sentiment should declare outputs in frontmatter."""
    TASK = (
        "Create a workflow named 'classify-text' that takes a 'text' string input. "
        "Call the llm action to classify the sentiment as positive, negative, or neutral. "
        "Declare outputs in frontmatter for 'sentiment' (str) and 'confidence' (str). "
        "Return both values."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    skill = parse_skill(content)
    code = extract_code(content)

    assert skill.outputs is not None and "sentiment" in skill.outputs, (
        f"Expected 'sentiment' in outputs frontmatter, got: {skill.outputs}\n\nGenerated:\n{content}"  # noqa: E501
    )
    assert skill.outputs is not None and "confidence" in skill.outputs, (
        f"Expected 'confidence' in outputs frontmatter, got: {skill.outputs}\n\nGenerated:\n{content}"  # noqa: E501
    )
    assert has_activity_named(code, "llm"), (
        f"Expected llm activity for sentiment classification\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 14: scrape object-form selector
# ---------------------------------------------------------------------------


async def test_scrape_object_selector(generate_skill, parse_skill, extract_code, save_snapshot):
    """Extracting link text and href should use an object-form selector dict."""
    TASK = (
        "Create a workflow named 'extract-links' that takes a 'url' string input. "
        "Use scrape to extract all links from anchor tags — get both the link text "
        "and the href attribute using the appropriate selector forms. "
        "Return the results. Do not use the llm action."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_activity_named(code, "scrape"), (
        f"Expected scrape activity\n\nCode:\n{code}"
    )
    assert not has_activity_named(code, "llm"), (
        f"Deterministic extraction should not use llm\n\nCode:\n{code}"
    )
    assert has_nested_dict_in_activity_args(code), (
        f"Expected object-form selector (nested dict) in scrape args\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 15: Error recovery with retry
# ---------------------------------------------------------------------------


async def test_error_recovery_with_retry(generate_skill, parse_skill, extract_code, save_snapshot):
    """A resilient api call should combine RetryPolicy and try/except."""
    TASK = (
        "Create a workflow named 'resilient-fetch' that takes a 'url' string input. "
        "Call the URL with the api action and a RetryPolicy of maximum_attempts=3. "
        "Wrap the call in try/except — on final failure after retries, return an error dict "
        "with 'success' as False and 'error' with the exception message."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_retry_policy(code), (
        f"Expected RetryPolicy(...) call\n\nCode:\n{code}"
    )
    assert has_try_except(code), (
        f"Expected try/except block\n\nCode:\n{code}"
    )
    assert activity_inside_node(code, ast.Try), (
        f"Expected execute_activity inside the try block\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 16: Scrape before LLM — data minimization
# ---------------------------------------------------------------------------


async def test_scrape_before_llm(generate_skill, parse_skill, extract_code, save_snapshot):
    """Extracting structured job data and summarizing should use scrape before llm."""
    TASK = (
        "Create a workflow named 'hiring-landscape' that takes a 'url' string input. "
        "The page uses CSS class '.job-title' for job titles and"
        " '.company-name' for company names. "
        "Use scrape with those selectors to extract the job titles and company names. "
        "Then use the llm action with a JSON schema to summarize the hiring landscape"
        " in 2-3 sentences. "
        "Return the summary."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_activity_named(code, "scrape"), (
        f"Expected scrape activity\n\nCode:\n{code}"
    )
    assert has_activity_named(code, "llm"), (
        f"Expected llm activity\n\nCode:\n{code}"
    )
    assert not has_activity_named(code, "web_fetch"), (
        f"Should use scrape (not web_fetch) to minimize LLM input\n\nCode:\n{code}"
    )
    assert has_schema_arg(code), (
        f"Expected 'schema' key in llm activity args dict\n\nCode:\n{code}"
    )
    assert has_scrape_feeding_llm(code), (
        f"Expected scrape call before llm call in statement order\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 17: Filter before LLM — Python filtering between scrape and LLM
# ---------------------------------------------------------------------------


async def test_filter_before_llm(generate_skill, parse_skill, extract_code, save_snapshot):
    """Scraping blog posts and filtering to 2025 should use Python between scrape and LLM."""
    TASK = (
        "Create a workflow named 'blog-themes' that takes a 'url' string input. "
        "Use scrape to extract blog post titles (CSS: '.post-title')"
        " and dates (CSS: '.post-date'). "
        "Filter the results in pure Python to only include posts from 2025"
        " (check if '2025' appears in the date string). "
        "Then use the llm action to summarize the themes of the 2025 posts. "
        "Return the summary."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_activity_named(code, "scrape"), (
        f"Expected scrape activity\n\nCode:\n{code}"
    )
    assert has_activity_named(code, "llm"), (
        f"Expected llm activity\n\nCode:\n{code}"
    )
    assert not has_activity_named(code, "web_fetch"), (
        f"Should use scrape (not web_fetch) to minimize LLM input\n\nCode:\n{code}"
    )
    assert has_for_loop(code) or has_list_comprehension(code), (
        f"Expected for loop or list comprehension for Python filtering\n\nCode:\n{code}"
    )
    assert has_scrape_feeding_llm(code), (
        f"Expected scrape call before llm call in statement order\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 18: Human-in-the-loop — basic signal wait
# ---------------------------------------------------------------------------


async def test_human_in_the_loop(generate_skill, parse_skill, extract_code, save_snapshot):
    """A workflow requiring human approval should use wait_for_signal."""
    TASK = (
        "Create a workflow named 'approval-gate' that takes a 'request' string input. "
        "Use the api action to submit the request to https://example.com/api/submit. "
        "Then pause and wait for a human signal named 'approval'. "
        "If the signal data has 'approved' equal to true, return {'status': 'approved'}. "
        "Otherwise return {'status': 'rejected'}."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_activity_named(code, "api"), (
        f"Expected api activity\n\nCode:\n{code}"
    )
    assert has_wait_for_signal(code), (
        f"Expected workflow.wait_for_signal() call\n\nCode:\n{code}"
    )
    assert has_if_branch(code), (
        f"Expected if branch for approval check\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 19: Signal with timeout
# ---------------------------------------------------------------------------


async def test_signal_with_timeout(generate_skill, parse_skill, extract_code, save_snapshot):
    """A workflow with a signal deadline should use wait_for_signal with timeout and try/except."""
    TASK = (
        "Create a workflow named 'timed-approval' that takes a 'request' string input. "
        "Wait for a human signal named 'approval' with a 1-hour timeout. "
        "If the approval times out, return {'status': 'timed_out'}. "
        "If the signal is received and approved, return {'status': 'approved'}. "
        "Otherwise return {'status': 'rejected'}."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    parse_skill(content)
    code = extract_code(content)

    assert has_wait_for_signal(code), (
        f"Expected workflow.wait_for_signal() call\n\nCode:\n{code}"
    )
    assert has_wait_for_signal_with_timeout(code), (
        f"Expected timeout parameter on wait_for_signal\n\nCode:\n{code}"
    )
    assert has_try_except(code), (
        f"Expected try/except for TimeoutError handling\n\nCode:\n{code}"
    )


# ---------------------------------------------------------------------------
# Test 20: exec action — CLI tool invocation
# ---------------------------------------------------------------------------


async def test_exec_action(generate_skill, parse_skill, extract_code, save_snapshot):
    """A workflow running a shell command should use the exec action."""
    TASK = (
        "Create a workflow named 'disk-usage' that takes a 'path' string input "
        "(default '.'). Run the 'du -sh' command on that path using the exec action. "
        "If the command fails (exit_code != 0), return {'status': 'error', 'output': <output>}. "
        "Otherwise return {'status': 'ok', 'usage': <output>}."
    )
    content = await _generate_with_retries(generate_skill, TASK, toolpack="builtin")
    save_snapshot(content)

    skill = parse_skill(content)
    code = extract_code(content)

    assert "path" in skill.inputs, (
        f"Expected 'path' in inputs, got: {list(skill.inputs)}\n\nGenerated:\n{content}"
    )
    assert count_execute_activity(code) == 1, (
        f"Expected exactly 1 activity call, got {count_execute_activity(code)}\n\nCode:\n{code}"
    )
    assert has_activity_named(code, "exec"), (
        f"Expected activity named 'exec'\n\nCode:\n{code}"
    )
    assert has_if_branch(code), (
        f"Expected if branch for exit code check\n\nCode:\n{code}"
    )
    assert not has_activity_named(code, "llm"), (
        f"Simple CLI invocation should not use llm\n\nCode:\n{code}"
    )
