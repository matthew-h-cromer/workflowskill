/**
 * Eval: foreach step for per-item processing.
 *
 * Tests that the model uses foreach for per-item operations and sets
 * appropriate concurrency for parallel processing.
 */

import { describe, expect, it } from "vitest";
import {
  assertForeachConcurrency,
  assertHasStepType,
  assertParsed,
  stepsOfType,
} from "../checks.js";
import { runEval } from "../harness.js";

describe("eval: foreach", () => {
  it("generates a foreach step to process each email individually", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Fetch unread Gmail messages. For each message, use an LLM to classify it as urgent, normal, or spam. " +
        "Process each message individually — never batch them.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "action", rawContent!);
    assertHasStepType(workflow!, "foreach", rawContent!);

    // Each foreach body should have an action (the LLM call)
    const foreachs = stepsOfType(workflow!, "foreach");
    const hasActionInBody = foreachs.some((f) => f.body.some((s) => s.type === "action"));
    expect(
      hasActionInBody,
      `Expected foreach body to contain an action step.\n\nYAML:\n${rawContent}`,
    ).toBe(true);
  });

  it("sets concurrency > 1 when parallelism is requested", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Fetch a list of user emails from a Google Sheet. " +
        "For each user, call an LLM to generate a personalized welcome message. " +
        "Process up to 5 users at a time in parallel.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "foreach", rawContent!);
    assertForeachConcurrency(workflow!, 2, rawContent!);
  });
});
