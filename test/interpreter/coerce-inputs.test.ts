import { describe, expect, it } from "vitest";
import { WorkflowInputError } from "../../src/schema/errors.js";

// Access the private coerceInput via the interpreter module. We test it
// indirectly by calling runWorkflow with a minimal no-op workflow.
//
// The simplest approach: build a minimal Workflow and pass it through
// runWorkflow with an InMemoryRuntime so we can check what $input holds.
// For error cases we just expect runWorkflow to throw WorkflowInputError.

import { runWorkflow } from "../../src/interpreter/index.js";
import { InMemoryRuntime } from "../../src/runtime/index.js";
import { WeldableMockToolkit } from "../../src/toolkit/index.js";
import type { Workflow } from "../../src/schema/workflow.js";

function minimalWorkflow(inputType: string, defaultValue?: unknown): Workflow {
  const inputSpec: Record<string, unknown> = { type: inputType };
  if (defaultValue !== undefined) inputSpec.default = defaultValue;
  return {
    version: 1,
    name: "test-coerce",
    description: "minimal workflow for coercion testing",
    inputs: { val: inputSpec as never },
    outputs: { result: "{{ input.val }}" },
    steps: [
      {
        id: "noop",
        type: "transform",
        description: "noop",
        expr: "input.val",
        continue_on_error: false,
      },
    ],
  };
}

const toolkit = new WeldableMockToolkit();
const rt = () => new InMemoryRuntime();

describe("input coercion", () => {
  describe("number", () => {
    it("passes numeric values through", async () => {
      const out = await runWorkflow(minimalWorkflow("number"), { val: 3 }, rt(), toolkit);
      expect(out.result).toBe(3);
    });

    it("coerces numeric strings to number", async () => {
      const out = await runWorkflow(minimalWorkflow("number"), { val: "1" }, rt(), toolkit);
      expect(out.result).toBe(1);
    });

    it("coerces decimal string to number", async () => {
      const out = await runWorkflow(minimalWorkflow("number"), { val: "2.5" }, rt(), toolkit);
      expect(out.result).toBe(2.5);
    });

    it("throws WorkflowInputError for non-numeric string", async () => {
      await expect(
        runWorkflow(minimalWorkflow("number"), { val: "abc" }, rt(), toolkit),
      ).rejects.toThrow(WorkflowInputError);
    });

    it("passes undefined through when no default", async () => {
      const out = await runWorkflow(minimalWorkflow("number"), {}, rt(), toolkit);
      expect(out.result).toBeUndefined();
    });

    it("uses default when input omitted", async () => {
      const out = await runWorkflow(minimalWorkflow("number", 2), {}, rt(), toolkit);
      expect(out.result).toBe(2);
    });
  });

  describe("boolean", () => {
    it("passes boolean values through", async () => {
      const out = await runWorkflow(minimalWorkflow("boolean"), { val: true }, rt(), toolkit);
      expect(out.result).toBe(true);
    });

    it('coerces "true" to true', async () => {
      const out = await runWorkflow(minimalWorkflow("boolean"), { val: "true" }, rt(), toolkit);
      expect(out.result).toBe(true);
    });

    it('coerces "false" to false', async () => {
      const out = await runWorkflow(minimalWorkflow("boolean"), { val: "false" }, rt(), toolkit);
      expect(out.result).toBe(false);
    });

    it("coerces case-insensitively", async () => {
      const out = await runWorkflow(minimalWorkflow("boolean"), { val: "True" }, rt(), toolkit);
      expect(out.result).toBe(true);
    });

    it("throws WorkflowInputError for unrecognized string", async () => {
      await expect(
        runWorkflow(minimalWorkflow("boolean"), { val: "yes" }, rt(), toolkit),
      ).rejects.toThrow(WorkflowInputError);
    });
  });

  describe("array", () => {
    it("passes arrays through", async () => {
      const out = await runWorkflow(minimalWorkflow("array"), { val: [1, 2] }, rt(), toolkit);
      expect(out.result).toEqual([1, 2]);
    });

    it("coerces JSON-array string to array", async () => {
      const out = await runWorkflow(minimalWorkflow("array"), { val: '["a","b"]' }, rt(), toolkit);
      expect(out.result).toEqual(["a", "b"]);
    });

    it("throws WorkflowInputError for non-array JSON string", async () => {
      await expect(
        runWorkflow(minimalWorkflow("array"), { val: '{"key":"val"}' }, rt(), toolkit),
      ).rejects.toThrow(WorkflowInputError);
    });

    it("throws WorkflowInputError for plain string", async () => {
      await expect(
        runWorkflow(minimalWorkflow("array"), { val: "foo" }, rt(), toolkit),
      ).rejects.toThrow(WorkflowInputError);
    });
  });

  describe("string", () => {
    it("passes strings through", async () => {
      const out = await runWorkflow(minimalWorkflow("string"), { val: "hello" }, rt(), toolkit);
      expect(out.result).toBe("hello");
    });

    it("stringifies non-string values", async () => {
      const out = await runWorkflow(minimalWorkflow("string"), { val: 42 }, rt(), toolkit);
      expect(out.result).toBe("42");
    });
  });

  describe("null / undefined handling", () => {
    it("passes null through unchanged", async () => {
      const out = await runWorkflow(minimalWorkflow("number"), { val: null as never }, rt(), toolkit);
      expect(out.result).toBeNull();
    });
  });
});
