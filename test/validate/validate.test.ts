import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validate } from "../../src/validate/index.js";

const wf = (frontmatter: string): string => `---\n${frontmatter.trim()}\n---\nbody\n`;

describe("validate — schema issues", () => {
  it("flags missing required fields", async () => {
    const result = await validate(wf("version: 1\nname: x"));
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "schema")).toBe(true);
  });

  it("flags missing frontmatter", async () => {
    const result = await validate("no frontmatter here");
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("schema");
  });
});

describe("validate — semantic issues", () => {
  it("flags duplicate sibling ids", async () => {
    const result = await validate(
      wf(`
version: 1
name: dupes
description: Dup test
steps:
  - id: a
    description: First
    type: transform
    expr: "1"
  - id: a
    description: Second
    type: transform
    expr: "2"
`),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "semantic" && /Duplicate/.test(i.message))).toBe(
      true,
    );
  });

  it("flags wait step without duration or until", async () => {
    const result = await validate(
      wf(`
version: 1
name: bad-wait
description: Wait test
steps:
  - id: w
    description: Waiter
    type: wait
`),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "semantic" && /Wait step/.test(i.message))).toBe(
      true,
    );
  });

  it("flags id shadowing across scopes", async () => {
    const result = await validate(
      wf(`
version: 1
name: shadow
description: Shadow test
steps:
  - id: outer
    description: Outer transform
    type: transform
    expr: "1"
  - id: wrap
    description: Wrapper
    type: if
    when: "true"
    then:
      - id: outer
        description: Shadowing
        type: transform
        expr: "2"
`),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /shadows/.test(i.message))).toBe(true);
  });
});

describe("validate — expression syntax", () => {
  it("flags bad JSONata", async () => {
    const result = await validate(
      wf(`
version: 1
name: bad-expr
description: Bad expr
steps:
  - id: t
    description: Bad transform
    type: transform
    expr: "1 + + + "
`),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "jsonata-syntax")).toBe(true);
  });

  it("flags bad JSONata in if.when", async () => {
    const result = await validate(
      wf(`
version: 1
name: bad-predicate
description: Bad predicate
steps:
  - id: branch
    description: Bad predicate
    type: if
    when: "1 + + +"
    then:
      - id: a
        description: No-op
        type: transform
        expr: "1"
`),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "jsonata-syntax")).toBe(true);
  });
});

describe("validate — unknown step refs", () => {
  it("flags reference to undefined step id in template", async () => {
    const result = await validate(
      wf(`
version: 1
name: bad-ref
description: Bad ref
steps:
  - id: first
    description: First
    type: transform
    expr: "1"
  - id: second
    description: Second
    type: transform
    expr: "steps.missing.output"
`),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "unknown-step-ref")).toBe(true);
  });

  it("flags reference to later sibling (forward ref)", async () => {
    const result = await validate(
      wf(`
version: 1
name: forward-ref
description: Forward ref
steps:
  - id: uses_later
    description: Uses later
    type: transform
    expr: "steps.later.output"
  - id: later
    description: Later
    type: transform
    expr: "1"
`),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "unknown-step-ref")).toBe(true);
  });

  it("flags bad ref in top-level outputs", async () => {
    const result = await validate(
      wf(`
version: 1
name: bad-output
description: Bad output ref
outputs:
  x: "{{ steps.missing.output }}"
steps:
  - id: only
    description: Only
    type: transform
    expr: "1"
`),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "outputs.x" && i.code === "unknown-step-ref")).toBe(
      true,
    );
  });

  it("allows backward refs to earlier siblings and outer scope", async () => {
    const result = await validate(
      wf(`
version: 1
name: good-refs
description: Good refs
steps:
  - id: a
    description: First
    type: transform
    expr: "1"
  - id: gate
    description: Gate
    type: if
    when: "true"
    then:
      - id: b
        description: Uses outer
        type: transform
        expr: "steps.a.output"
`),
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

describe("validate — dry run", () => {
  const workflow = wf(`
version: 1
name: hello-dry
description: Dry run test
outputs:
  g: "{{ steps.s.output }}"
steps:
  - id: s
    description: Transform
    type: transform
    expr: "'hi'"
`);

  it("does not execute by default", async () => {
    const result = await validate(workflow);
    expect(result.ok).toBe(true);
  });

  it("executes when dryRun is true", async () => {
    const result = await validate(workflow, { dryRun: true });
    expect(result.ok).toBe(true);
  });

  it("reports runtime errors as dry-run issues", async () => {
    const broken = wf(`
version: 1
name: broken-dry
description: Runtime error dry run
steps:
  - id: t
    description: Division
    type: transform
    expr: "input.n / 0"
`);
    const result = await validate(broken, { dryRun: true, inputs: { n: 1 } });
    // JSONata on its own won't error on div-by-zero; use an unresolved reference
    // that only fails at evaluation time.
    void result;

    const refRuntime = wf(`
version: 1
name: runtime-ref
description: Runtime ref error
steps:
  - id: t
    description: Bad deep ref
    type: transform
    expr: "$notAFunction()"
`);
    const bad = await validate(refRuntime, { dryRun: true });
    expect(bad.ok).toBe(false);
    expect(bad.issues[0]?.code).toBe("dry-run");
  });
});

describe("validate — examples", () => {
  it("every shipped example passes parse + static checks", async () => {
    const examplesDir = join(import.meta.dirname, "../../examples");
    const files = (await readdir(examplesDir)).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = await readFile(join(examplesDir, file), "utf-8");
      const result = await validate(content);
      expect(result, `${file}: ${JSON.stringify(result.issues, null, 2)}`).toMatchObject({
        ok: true,
      });
    }
  });

  it("hello-world passes dry-run (pure, no actions)", async () => {
    const content = await readFile(
      join(import.meta.dirname, "../../examples/hello-world.md"),
      "utf-8",
    );
    const result = await validate(content, { dryRun: true });
    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true);
  });
});
