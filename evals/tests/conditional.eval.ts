/**
 * Eval: conditional branching (if / switch).
 *
 * Tests that the model uses if/switch for multi-way branching,
 * including early exit with return.
 */

import { describe, expect, it } from "vitest";
import { assertHasStepType, assertParsed, stepsOfType } from "../checks.js";
import { runEval } from "../harness.js";

describe("eval: conditional", () => {
  it("generates an if step for a two-way branch", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Search Gmail for urgent emails (subject contains 'URGENT'). " +
        "If any are found, post a Slack alert. If none are found, do nothing and return a quiet status.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "action", rawContent!);
    assertHasStepType(workflow!, "if", rawContent!);
  });

  it("uses return for early exit", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Fetch unread Gmail messages. If the inbox is empty, return immediately with status='empty'. " +
        "Otherwise, post a summary to Slack and return status='notified'.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "action", rawContent!);

    // Should have either a return step or an if step (to bail early)
    const hasReturn = stepsOfType(workflow!, "return").length > 0;
    const hasIf = stepsOfType(workflow!, "if").length > 0;
    expect(
      hasReturn || hasIf,
      `Expected a return or if step for early exit, found neither.\n\nYAML:\n${rawContent}`,
    ).toBe(true);
  });

  it("uses switch for multi-way branching on a value", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Take an input 'status' (string). " +
        "If status is 'pending', post to the #pending Slack channel. " +
        "If status is 'approved', post to the #approved Slack channel. " +
        "If status is 'rejected', post to the #rejected Slack channel. " +
        "Use the most appropriate branching primitive for three named cases.",
    );

    assertParsed(workflow, parseError, rawContent);
    // Should use switch for three named cases
    const hasSwitchOrIf =
      stepsOfType(workflow!, "switch").length > 0 || stepsOfType(workflow!, "if").length > 0;
    expect(
      hasSwitchOrIf,
      `Expected a switch or if step for three-way branch.\n\nYAML:\n${rawContent}`,
    ).toBe(true);
  });
});
