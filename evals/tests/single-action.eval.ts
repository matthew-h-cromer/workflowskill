/**
 * Eval: single action workflow.
 *
 * Tests that the model can generate a workflow with one action step
 * wired to a specific integration.
 */

import { describe, it } from "vitest";
import { assertHasInput, assertHasStepType, assertParsed } from "../checks.js";
import { runEval } from "../harness.js";

describe("eval: single action", () => {
  it("generates a workflow that calls one Gmail action", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Search Gmail for unread messages from the last 24 hours and return the results.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "action", rawContent!);

    const actions = workflow!.steps.filter((s) => s.type === "action");
    const uses = actions.map((a) => (a as { uses: string }).uses);
    const hasGmail = uses.some((u) => u.startsWith("gmail."));
    if (!hasGmail) {
      throw new Error(
        `Expected a gmail.* action but found: ${uses.join(", ")}\n\nGenerated YAML:\n${rawContent}`,
      );
    }
  });

  it("generates a workflow that calls Slack with an input", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Post a message to a Slack channel. The message text and channel name should be workflow inputs.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "action", rawContent!);
    assertHasInput(workflow!, "channel", rawContent!);
  });
});
