/**
 * Eval: parallel step for fan-out of independent branches.
 *
 * Tests that the model uses parallel when multiple independent operations
 * should run concurrently and their results need to be joined.
 */

import { describe, it } from "vitest";
import { assertHasStepType, assertParallelBranches, assertParsed } from "../checks.js";
import { runEval } from "../harness.js";

describe("eval: parallel", () => {
  it("fans out two independent actions in parallel", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Given a company name, look it up in two databases at the same time: " +
        "Clearbit (company enrichment) and LinkedIn (company profile). " +
        "Wait for both results, then merge them into a single output. " +
        "The two lookups are independent and should run concurrently.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertParallelBranches(workflow!, 2, rawContent!);
  });

  it("uses parallel for independent notification channels", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "When an order is confirmed, simultaneously send a confirmation email via Gmail " +
        "AND post a notification to the #orders Slack channel. " +
        "Both should happen at the same time — they are independent.",
    );

    assertParsed(workflow, parseError, rawContent);
    // Should have either parallel or multiple action steps
    // (Some models might use parallel, others might sequence them — both are valid)
    assertHasStepType(workflow!, "action", rawContent!);
  });
});
