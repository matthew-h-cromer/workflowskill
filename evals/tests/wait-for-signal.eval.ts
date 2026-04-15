/**
 * Eval: wait_for_signal for durable event-driven suspension.
 *
 * Tests that the model uses wait_for_signal for scenarios where the workflow
 * should pause until an external event (webhook, callback) arrives.
 */

import { describe, it } from "vitest";
import { expect } from "vitest";
import { assertHasStepType, assertHasWaitForSignal, assertParsed, stepsOfType } from "../checks.js";
import { runEval } from "../harness.js";

describe("eval: wait-for-signal", () => {
  it("uses wait_for_signal for a webhook callback pattern", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Submit a job to an external processing API and get back a job_id. " +
        "Then wait for an inbound webhook signal 'job.completed' that carries the job_id " +
        "in its payload. Once received, send a notification email with the result. " +
        "The workflow must durably wait — it could take hours.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasStepType(workflow!, "action", rawContent!);
    assertHasWaitForSignal(workflow!, rawContent!);
  });

  it("sets a timeout on wait_for_signal", async () => {
    const { workflow, parseError, rawContent } = await runEval(
      "Start an async data export job. Wait for a 'export.ready' signal. " +
        "If no signal arrives within 30 minutes, send an error email. " +
        "If the signal arrives, download the result and post it to Slack.",
    );

    assertParsed(workflow, parseError, rawContent);
    assertHasWaitForSignal(workflow!, rawContent!);

    // The wait_for_signal step should have a timeout
    const waitSteps = stepsOfType(workflow!, "wait_for_signal");
    const hasTimeout = waitSteps.every((w) => w.timeout !== undefined);
    expect(
      hasTimeout,
      `Expected wait_for_signal step(s) to have a timeout.\n\nYAML:\n${rawContent}`,
    ).toBe(true);
  });
});
