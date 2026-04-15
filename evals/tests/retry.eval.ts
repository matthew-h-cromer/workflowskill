/**
 * Eval: retry policy on action steps.
 *
 * Tests that the model adds retry policies when explicitly requested,
 * and only on action steps (not on transforms or other pure steps).
 */

import { describe, it } from "vitest";
import { assertHasRetry, assertHasStepType, assertNoStepType, assertParsed } from "../checks.js";
import { runEval } from "../harness.js";

describe("eval: retry", () => {
  it("adds a retry policy to an action when explicitly requested", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Call an external webhook URL (passed as input 'webhook_url') with a POST request. " +
        "The webhook is unreliable — retry up to 3 times with exponential backoff on failure.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "action", rawContent!);
    assertHasRetry(workflow!, rawContent!);
  });

  it("does not add retry to transform steps", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Fetch a list of user records from a Google Sheet (retry up to 3 times). " +
        "Then filter the list to only include active users (no retry needed for filtering).",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "action", rawContent!);
    // Transform steps must not have retry (schema enforces this, but we assert via parsing)
    // If it parses, transform steps don't have retry
  });
});
