/**
 * Eval: singleton-safe foreach patterns.
 *
 * Tests that the model uses the `[]` postfix on filter/map/sort/path expressions
 * inside foreach.items to guard against JSONata's singleton-collapse behavior.
 * A single result from $filter collapses to a scalar; foreach.items must receive
 * an array or it throws at runtime.
 *
 * This eval catches regressions when SKILL.md's JSONata-patterns guidance is removed
 * or edited — if the model omits the `[]`, validate() will surface a dry-run error.
 */

import { describe, expect, it } from "vitest";
import { stepsOfType, assertParsed, assertHasStepType } from "../checks.js";
import { runEval } from "../harness.js";
import { validate } from "../../src/validate/index.js";
import { WeldableMockToolkit } from "../../src/toolkit/weldable/mock.js";

describe("eval: foreach singleton-safe patterns", () => {
  it("foreach.items expression using $filter passes workflowskill validate", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Search Gmail for unread emails. " +
        "Filter the results to only emails with subject containing 'Invoice'. " +
        "For each matching email, use an LLM to extract the invoice amount. " +
        "Collect the amounts and return a total.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "foreach", rawContent!);

    // Validate the generated workflow — this catches a missing [] on foreach.items
    // because dry-run will hit the foreach scalar-coercion error at runtime.
    const toolkit = new WeldableMockToolkit();
    const result = await validate(rawContent!, {
      toolkit,
      dryRun: true,
    });

    const errors = result.issues.filter((i) => i.severity === "error");
    expect(
      errors,
      `Workflow failed validation (singleton-collapse likely — check foreach.items uses []): ` +
        `${JSON.stringify(errors, null, 2)}\n\nGenerated YAML:\n${rawContent}`,
    ).toHaveLength(0);

    // Verify the foreach step exists and its items expression contains []
    const foreachs = stepsOfType(workflow!, "foreach");
    const hasSafeItems = foreachs.some((f) => f.items.includes("[]"));
    expect(
      hasSafeItems,
      `Expected at least one foreach.items to use [] for singleton safety.\n\nGenerated YAML:\n${rawContent}`,
    ).toBe(true);
  });
});
