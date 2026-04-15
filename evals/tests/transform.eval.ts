/**
 * Eval: transform step for data reshaping.
 *
 * Tests that the model uses transform for pure data manipulation
 * instead of reaching for an LLM action.
 */

import { describe, it } from "vitest";
import { assertHasStepType, assertNoAction, assertParsed } from "../checks.js";
import { runEval } from "../harness.js";

describe("eval: transform", () => {
  it("uses transform to reshape an API response, not an LLM", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Call gmail.search to get unread messages. Then extract only the subject and from fields " +
        "from each message into a clean list. No LLM call needed — reshape the data directly.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "action", rawContent!);
    assertHasStepType(workflow!, "transform", rawContent!);
    // Should NOT call an LLM to do simple field extraction
    assertNoAction(workflow!, "anthropic", rawContent!);
  });

  it("uses transform for string concatenation and formatting", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Take inputs: first_name (string) and last_name (string). " +
        "Return a greeting like 'Hello, FirstName LastName!' using only data transformation — no actions.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "transform", rawContent!);
    assertNoAction(workflow!, "anthropic", rawContent!);
  });
});
