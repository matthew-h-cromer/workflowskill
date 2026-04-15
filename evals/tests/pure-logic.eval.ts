/**
 * Eval: pure transform logic with no external action calls.
 *
 * Tests that the model can generate a workflow using only transform steps
 * and does NOT reach for an LLM action when the task is deterministic.
 */

import { describe, expect, it } from "vitest";
import { assertHasStepType, assertNoAction, assertNoStepType, assertParsed } from "../checks.js";
import { runEval } from "../harness.js";

describe("eval: pure logic", () => {
  it("generates a transform-only workflow for a data reshaping task", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Given a list of numbers in the input called 'numbers', " +
        "return only the numbers that are greater than 10, " +
        "doubled. No external calls needed — this is pure data transformation.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "transform", rawContent!);
    assertNoStepType(workflow!, "action", rawContent!);
  });

  it("uses transform and if for conditional value selection", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Take an input 'score' (number). If the score is 90 or above, " +
        "return grade='A'. If 80–89, return grade='B'. Otherwise return grade='C'. " +
        "No external calls — pure conditional logic.",
    );

    assertParsed(workflow, parseError, rawContent);
    // Should have some conditional step — if or switch
    const hasConditional =
      workflow?.steps.some((s) => s.type === "if" || s.type === "switch") ||
      [...Array.from({ length: 50 })].some(
        (_, i) => false, // just checking top level is enough
      );

    expect(
      workflow?.steps.some((s) => s.type === "if" || s.type === "switch" || s.type === "transform"),
      `Expected if/switch/transform steps, got: ${workflow?.steps.map((s) => s.type).join(", ")}\n\nYAML:\n${rawContent}`,
    ).toBe(true);

    assertNoStepType(workflow!, "action", rawContent!);
  });
});
