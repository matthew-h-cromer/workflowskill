import { describe, expect, it } from "vitest";
import { extractBody, extractFrontmatter } from "../../src/loader/frontmatter.js";
import { parseWorkflowContent } from "../../src/loader/parse.js";
import { StepSchema } from "../../src/schema/steps.js";

const MINIMAL_SKILL_MD = `---
version: 1
name: hello-world
description: A simple greeting
steps:
  - id: s
    type: return
    description: Return hello
    value: done
---

## Usage
Run this workflow using the run_workflow tool.
`;

describe("extractFrontmatter", () => {
  it("extracts YAML from .workflow.md frontmatter", () => {
    const result = extractFrontmatter(MINIMAL_SKILL_MD);
    expect(result).toMatchObject({ version: 1, name: "hello-world" });
  });

  it("returns null when no frontmatter", () => {
    expect(extractFrontmatter("# No frontmatter\nsome content")).toBeNull();
  });
});

describe("extractBody", () => {
  it("returns the markdown body after the closing ---", () => {
    const body = extractBody(MINIMAL_SKILL_MD);
    expect(body).toContain("## Usage");
    expect(body).not.toContain("---");
  });

  it("returns empty string when no frontmatter", () => {
    expect(extractBody("# No frontmatter\nsome content")).toBe("");
  });

  it("ignores any yaml fenced code blocks in the body", () => {
    const content = `---
version: 1
name: test
description: A test
steps:
  - id: s
    type: return
    description: Return done
    value: done
---

Here is a description.

\`\`\`yaml
version: 1
name: should-be-ignored
steps: []
\`\`\`
`;
    const body = extractBody(content);
    expect(body).toContain("Here is a description.");
    expect(body).toContain("should-be-ignored");
    // The body is returned as-is (including fenced blocks) — the parser only reads frontmatter
    const parsed = parseWorkflowContent(content, ".md");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.workflow.name).toBe("test");
    }
  });
});

describe("parseWorkflowContent", () => {
  it("parses a .md file with valid frontmatter and returns the body", () => {
    const r = parseWorkflowContent(MINIMAL_SKILL_MD, ".md");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.workflow.name).toBe("hello-world");
      expect(r.body).toContain("## Usage");
    }
  });

  it("errors on .md with no frontmatter", () => {
    const r = parseWorkflowContent("# No frontmatter", ".md");
    expect(r.ok).toBe(false);
  });

  it("errors on .yaml extension", () => {
    const yaml = `
version: 1
name: test
description: Testing
steps:
  - id: s
    type: return
    description: Return done
    value: done
`;
    const r = parseWorkflowContent(yaml, ".yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("Unsupported file type");
    }
  });

  it("errors on schema violation (empty steps)", () => {
    const content = `---
version: 1
name: test
description: Test
steps: []
---
`;
    const r = parseWorkflowContent(content, ".md");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("schema validation failed");
    }
  });

  it("errors when step is missing description", () => {
    const content = `---
version: 1
name: test
description: Test
steps:
  - id: s
    type: return
    value: done
---
`;
    const r = parseWorkflowContent(content, ".md");
    expect(r.ok).toBe(false);
  });

  it("errors when step description exceeds 80 characters", () => {
    const longDesc = "A".repeat(81);
    const content = `---
version: 1
name: test
description: Test
steps:
  - id: s
    type: return
    description: "${longDesc}"
    value: done
---
`;
    const r = parseWorkflowContent(content, ".md");
    expect(r.ok).toBe(false);
  });

  it("errors when step description contains a newline", () => {
    // In YAML double-quoted strings, \n is a real newline escape.
    // We pass the parsed object directly to avoid YAML syntax issues.
    const r = StepSchema.safeParse({
      id: "s",
      description: "line one\nline two",
      type: "return",
      value: "'done'",
    });
    expect(r.success).toBe(false);
  });

  it("errors on duplicate step ids", () => {
    const content = `---
version: 1
name: test
description: Test
steps:
  - id: foo
    description: First step
    type: return
    value: done
  - id: foo
    description: Second step
    type: return
    value: done
---
`;
    const r = parseWorkflowContent(content, ".md");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain("validation failed");
    }
  });

  it("errors on shadowed outer id", () => {
    const content = `---
version: 1
name: test
description: Test
steps:
  - id: outer
    description: Outer step
    type: return
    value: x
  - id: branch
    description: If condition, shadow outer id
    type: if
    when: "true"
    then:
      - id: outer
        description: Inner step that shadows outer
        type: return
        value: y
---
`;
    const r = parseWorkflowContent(content, ".md");
    expect(r.ok).toBe(false);
  });
});
