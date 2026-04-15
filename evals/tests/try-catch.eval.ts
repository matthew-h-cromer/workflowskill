/**
 * Eval: try/catch for error recovery.
 *
 * Tests that the model uses try/catch when the task requires graceful
 * error handling around fallible operations.
 */

import { describe, it } from "vitest";
import { assertHasStepType, assertHasTryCatch, assertParsed } from "../checks.js";
import { runEval } from "../harness.js";

describe("eval: try-catch", () => {
  it("wraps a fallible action in try/catch", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Post a summary message to Slack. " +
        "If the Slack call fails for any reason, post a warning to the ops channel and continue — " +
        "the notification failure should not crash the workflow.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "action", rawContent!);
    assertHasTryCatch(workflow!, rawContent!);
  });

  it("uses try/catch with a fallback action", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Try to enrich a contact using Clearbit. " +
        "If Clearbit fails or times out, fall back to a basic transform that builds " +
        "a minimal contact record from the input email address. " +
        "Always return a contact record, even if enrichment fails.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasTryCatch(workflow!, rawContent!);
  });
});
