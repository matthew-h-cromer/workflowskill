import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runWorkflow } from "../src/interpreter/index.js";
import { parseWorkflowContent } from "../src/loader/parse.js";
import { InMemoryRuntime } from "../src/runtime/memory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

/**
 * Null toolkit — returns a placeholder for any action.
 * Conformance tests should not use action steps; this is a safety net.
 */
const nullToolkit = {
  name: "null",
  description: "Null toolkit for conformance tests",
  async execute(action: string): Promise<unknown> {
    throw new Error(`Action "${action}" was called in a conformance test. Use pure steps only.`);
  },
  async getAuthoringContext(): Promise<string> {
    return "";
  },
  async listActions() {
    return [];
  },
  async getAction(_id: string) {
    return undefined;
  },
};

async function loadFixture(name: string): Promise<{
  workflowContent: string;
  inputs: Record<string, unknown>;
  expectedOutput: Record<string, unknown> | undefined;
}> {
  const dir = join(FIXTURES_DIR, name);
  const workflowContent = await readFile(join(dir, "workflow.md"), "utf-8");
  const inputsRaw = await readFile(join(dir, "inputs.json"), "utf-8");
  const inputs = JSON.parse(inputsRaw) as Record<string, unknown>;

  let expectedOutput: Record<string, unknown> | undefined;
  try {
    const raw = await readFile(join(dir, "expected_output.json"), "utf-8");
    expectedOutput = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Some fixtures only test that the workflow parses + runs without error
  }

  return { workflowContent, inputs, expectedOutput };
}

async function listFixtures(): Promise<string[]> {
  const entries = await readdir(FIXTURES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

describe("conformance", async () => {
  const fixtures = await listFixtures();

  for (const fixtureName of fixtures) {
    it(`fixture: ${fixtureName}`, async () => {
      const { workflowContent, inputs, expectedOutput } = await loadFixture(fixtureName);

      // 1. Parse must succeed
      const parseResult = parseWorkflowContent(workflowContent, ".md");
      expect(
        parseResult.ok,
        `Parse failed: ${JSON.stringify(!parseResult.ok && parseResult.error)}`,
      ).toBe(true);
      if (!parseResult.ok) return;

      // 2. Run must complete without error
      const runtime = new InMemoryRuntime();
      const output = await runWorkflow(parseResult.workflow, inputs, runtime, nullToolkit);

      // 3. Output must match expected (if provided)
      if (expectedOutput !== undefined) {
        expect(output).toEqual(expectedOutput);
      } else {
        // No expected output — just verify it's a dict
        expect(typeof output).toBe("object");
        expect(output).not.toBeNull();
      }
    });
  }
});
