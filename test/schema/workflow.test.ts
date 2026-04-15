import { describe, expect, it } from "vitest";
import { StepSchema, WorkflowSchema } from "../../src/schema/index.js";

// Minimal valid return step used as a stand-in throughout tests that aren't
// specifically testing the step type itself.
const minimalReturn = { id: "s", description: "Return done", type: "return", value: "'done'" };

describe("WorkflowSchema", () => {
  it("parses a minimal valid workflow", () => {
    const result = WorkflowSchema.safeParse({
      version: 1,
      name: "hello-world",
      description: "A simple greeting",
      steps: [
        {
          id: "greet",
          description: "Build the greeting string",
          type: "transform",
          expr: "{ 'message': 'Hello, ' & input.name }",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown version", () => {
    const result = WorkflowSchema.safeParse({
      version: 2,
      name: "test",
      description: "Test",
      steps: [minimalReturn],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty steps array", () => {
    const result = WorkflowSchema.safeParse({
      version: 1,
      name: "test",
      description: "Test",
      steps: [],
    });
    expect(result.success).toBe(false);
  });

  it("parses inputs with defaults", () => {
    const result = WorkflowSchema.safeParse({
      version: 1,
      name: "greeter",
      description: "Greets a user",
      inputs: {
        name: { type: "string", default: "World" },
        count: { type: "number" },
      },
      steps: [minimalReturn],
    });
    expect(result.success).toBe(true);
  });

  it("parses outputs as expression strings", () => {
    const result = WorkflowSchema.safeParse({
      version: 1,
      name: "greeter",
      description: "Greets",
      outputs: { greeting: "{{ steps.greet.output.message }}" },
      steps: [minimalReturn],
    });
    expect(result.success).toBe(true);
  });
});

describe("StepSchema", () => {
  it("parses an action step", () => {
    const result = StepSchema.safeParse({
      id: "send",
      description: "Post a message to Slack",
      type: "action",
      uses: "slack.post_message",
      with: { channel: "#general", text: "Hello" },
      retry: { max_attempts: 3, backoff: "exponential" },
    });
    expect(result.success).toBe(true);
  });

  it("strips retry from a transform step (schema-level; loader validates semantics)", () => {
    // The Zod union strips unknown fields — retry isn't in TransformStep's schema.
    // The semantic constraint is enforced by validateSteps in the loader.
    const result = StepSchema.safeParse({
      id: "reshape",
      description: "Reshape the output",
      type: "transform",
      expr: "steps.foo.output",
    });
    expect(result.success).toBe(true);
  });

  it("parses a wait step with duration", () => {
    const r = StepSchema.safeParse({
      id: "w",
      description: "Wait 5 minutes",
      type: "wait",
      duration: "5m",
    });
    expect(r.success).toBe(true);
  });

  it("parses a wait step with until", () => {
    const r = StepSchema.safeParse({
      id: "w",
      description: "Wait until the scheduled time",
      type: "wait",
      until: "{{ input.scheduled_at }}",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a wait step with both duration and until", () => {
    const r = StepSchema.safeParse({
      id: "w",
      description: "Wait with conflicting options",
      type: "wait",
      duration: "5m",
      until: "{{ input.scheduled_at }}",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a wait step with neither duration nor until", () => {
    const r = StepSchema.safeParse({ id: "w", description: "Wait with no options", type: "wait" });
    expect(r.success).toBe(false);
  });

  it("parses a foreach step", () => {
    const r = StepSchema.safeParse({
      id: "loop",
      description: "For each item, return its id",
      type: "foreach",
      items: "{{ steps.list.output }}",
      as: "item",
      body: [{ id: "result", description: "Return the item id", type: "return", value: "item.id" }],
    });
    expect(r.success).toBe(true);
  });

  it("parses a while step with max_iterations", () => {
    const r = StepSchema.safeParse({
      id: "poll",
      description: "Until check is done, poll for status",
      type: "while",
      when: "steps.check.output.status != 'done'",
      max_iterations: 60,
      body: [
        { id: "status", description: "Return polling status", type: "return", value: "'polling'" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a while step without max_iterations", () => {
    const r = StepSchema.safeParse({
      id: "poll",
      description: "Poll without a safety cap",
      type: "while",
      when: "true",
      body: [{ id: "s", description: "Return x", type: "return", value: "'x'" }],
    });
    expect(r.success).toBe(false);
  });

  it("parses nested if/else", () => {
    const r = StepSchema.safeParse({
      id: "branch",
      description: "If count is positive, return positive; else return non-positive",
      type: "if",
      when: "input.count > 0",
      then: [{ id: "pos", description: "Return positive", type: "return", value: "'positive'" }],
      else: [
        { id: "neg", description: "Return non-positive", type: "return", value: "'non-positive'" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("parses wait_for_signal step", () => {
    const r = StepSchema.safeParse({
      id: "await_payment",
      description: "Wait for the Stripe payment webhook",
      type: "wait_for_signal",
      signal: "stripe.payment_succeeded",
      match: { "customer.email": "{{ input.email }}" },
      timeout: "7d",
      on_timeout: "abort",
    });
    expect(r.success).toBe(true);
  });

  it("parses parallel step", () => {
    const r = StepSchema.safeParse({
      id: "fan_out",
      description: "In parallel, run branches a and b",
      type: "parallel",
      branches: {
        a: [
          { id: "ra", description: "Return branch a result", type: "return", value: "'branch_a'" },
        ],
        b: [
          { id: "rb", description: "Return branch b result", type: "return", value: "'branch_b'" },
        ],
      },
    });
    expect(r.success).toBe(true);
  });

  it("parses try/catch/finally", () => {
    const r = StepSchema.safeParse({
      id: "risky",
      description: "Sync data with error recovery",
      type: "try",
      body: [
        { id: "op", description: "Sync to external system", type: "action", uses: "external.sync" },
      ],
      catch: [
        {
          id: "err",
          description: "Return error result",
          type: "return",
          value: "{ 'error': error.message }",
        },
      ],
      finally: [
        { id: "done", description: "Return completion marker", type: "return", value: "'done'" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a step with missing description", () => {
    const r = StepSchema.safeParse({ id: "s", type: "return", value: "'done'" });
    expect(r.success).toBe(false);
  });

  it("rejects a step with description longer than 80 characters", () => {
    const r = StepSchema.safeParse({
      id: "s",
      description: "A".repeat(81),
      type: "return",
      value: "'done'",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a step with description exactly 80 characters", () => {
    const r = StepSchema.safeParse({
      id: "s",
      description: "A".repeat(80),
      type: "return",
      value: "'done'",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a step with a multi-line description", () => {
    const r = StepSchema.safeParse({
      id: "s",
      description: "line one\nline two",
      type: "return",
      value: "'done'",
    });
    expect(r.success).toBe(false);
  });
});
