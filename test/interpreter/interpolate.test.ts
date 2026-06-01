import { describe, expect, it } from "vitest";
import { runWorkflow } from "../../src/interpreter/index.js";
import { InMemoryRuntime } from "../../src/runtime/index.js";
import type { Toolkit } from "../../src/toolkit/protocol.js";
import type { Workflow } from "../../src/schema/workflow.js";

type Call = { action: string; args: Record<string, unknown> };

function recordingToolkit(): { toolkit: Toolkit; calls: Call[] } {
  const calls: Call[] = [];
  const toolkit: Toolkit = {
    name: "recording",
    description: "captures execute calls for assertion",
    async execute(action, args) {
      calls.push({ action, args });
      return {};
    },
    async getAuthoringContext() {
      return "";
    },
    async listActions() {
      return [];
    },
    async getAction() {
      return undefined;
    },
  };
  return { toolkit, calls };
}

const rt = () => new InMemoryRuntime();

describe("interpolateArgs — array recursion", () => {
  it("resolves {{ }} spans inside array-of-objects in with:", async () => {
    const workflow: Workflow = {
      version: 1,
      name: "test-array-interpolation",
      description: "verify arrays in with: are recursed",
      inputs: {
        resume: { type: "string" },
        job: { type: "string" },
      },
      outputs: { ok: "'done'" },
      steps: [
        {
          id: "call",
          type: "action",
          description: "action with array-form arg",
          uses: "mock.action",
          with: {
            prompt: [
              { text: "## Resume\n\n{{ input.resume }}", cache: true },
              { text: "## Job\n\n{{ input.job }}" },
            ],
          },
          continue_on_error: false,
        },
      ],
    };

    const { toolkit, calls } = recordingToolkit();
    await runWorkflow(workflow, { resume: "My resume body", job: "Senior Engineer at Acme" }, rt(), toolkit);

    expect(calls).toHaveLength(1);
    const prompt = calls[0]!.args.prompt as Array<{ text: string; cache?: boolean }>;
    expect(Array.isArray(prompt)).toBe(true);
    expect(prompt[0]!.text).toBe("## Resume\n\nMy resume body");
    expect(prompt[0]!.cache).toBe(true);
    expect(prompt[1]!.text).toBe("## Job\n\nSenior Engineer at Acme");
  });

  it("recurses deeply (array inside object inside array)", async () => {
    const workflow: Workflow = {
      version: 1,
      name: "test-deep-recursion",
      description: "verify deep array+object nesting is recursed",
      inputs: { val: { type: "string" } },
      outputs: { ok: "'done'" },
      steps: [
        {
          id: "call",
          type: "action",
          description: "deep nesting",
          uses: "mock.action",
          with: {
            blocks: [{ nested: { text: "Value is {{ input.val }}" } }],
          },
          continue_on_error: false,
        },
      ],
    };

    const { toolkit, calls } = recordingToolkit();
    await runWorkflow(workflow, { val: "hello" }, rt(), toolkit);

    const blocks = calls[0]!.args.blocks as Array<{ nested: { text: string } }>;
    expect(blocks[0]!.nested.text).toBe("Value is hello");
  });

  it("single-span {{ expr }} inside array item returns raw value (no String() coercion)", async () => {
    const workflow: Workflow = {
      version: 1,
      name: "test-single-span-passthrough",
      description: "single {{ expr }} in array item returns raw value",
      inputs: { items: { type: "array" } },
      outputs: { ok: "'done'" },
      steps: [
        {
          id: "call",
          type: "action",
          description: "single span raw passthrough",
          uses: "mock.action",
          with: {
            list: [{ value: "{{ input.items }}" }],
          },
          continue_on_error: false,
        },
      ],
    };

    const { toolkit, calls } = recordingToolkit();
    await runWorkflow(workflow, { items: ["a", "b", "c"] }, rt(), toolkit);

    const list = calls[0]!.args.list as Array<{ value: unknown }>;
    expect(list[0]!.value).toEqual(["a", "b", "c"]);
  });

  it("scalar string with: values still resolve correctly (regression guard)", async () => {
    const workflow: Workflow = {
      version: 1,
      name: "test-scalar-regression",
      description: "scalar string with: values still work",
      inputs: { msg: { type: "string" } },
      outputs: { ok: "'done'" },
      steps: [
        {
          id: "call",
          type: "action",
          description: "scalar string",
          uses: "mock.action",
          with: { message: "Hello {{ input.msg }}!" },
          continue_on_error: false,
        },
      ],
    };

    const { toolkit, calls } = recordingToolkit();
    await runWorkflow(workflow, { msg: "world" }, rt(), toolkit);

    expect(calls[0]!.args.message).toBe("Hello world!");
  });
});
