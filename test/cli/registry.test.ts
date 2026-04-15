import { describe, expect, it } from "vitest";
import { listRuntimes, loadRuntime, registerRuntime } from "../../src/runtime/registry.js";
import { listToolkits, loadToolkit, registerToolkit } from "../../src/toolkit/registry.js";

describe("toolkit registry", () => {
  it("loads the default weldable toolkit", async () => {
    const toolkit = await loadToolkit("weldable");
    expect(toolkit.name).toMatch(/weldable/);
    expect(typeof toolkit.execute).toBe("function");
    expect(typeof toolkit.getAuthoringContext).toBe("function");
  });

  it("throws a helpful error for unknown names", async () => {
    await expect(loadToolkit("nonsense")).rejects.toThrow(/Unknown toolkit: "nonsense"/);
    await expect(loadToolkit("nonsense")).rejects.toThrow(/weldable/);
  });

  it("round-trips a custom factory", async () => {
    const fake = {
      name: "fake",
      description: "fake toolkit",
      execute: async () => ({}),
      getAuthoringContext: async () => "",
      listActions: async () => [],
      getAction: async (_id: string) => undefined,
    };
    registerToolkit("fake", () => fake);
    expect(listToolkits()).toContain("fake");
    expect(await loadToolkit("fake")).toBe(fake);
  });
});

describe("runtime registry", () => {
  it("loads the default in-memory runtime", async () => {
    const runtime = await loadRuntime("memory");
    expect(typeof runtime.runId).toBe("string");
    expect(typeof runtime.executeStep).toBe("function");
    expect(typeof runtime.executeBranches).toBe("function");
    expect(typeof runtime.sleep).toBe("function");
    expect(typeof runtime.waitForSignal).toBe("function");
  });

  it("throws a helpful error for unknown names", async () => {
    await expect(loadRuntime("nonsense")).rejects.toThrow(/Unknown runtime: "nonsense"/);
    await expect(loadRuntime("nonsense")).rejects.toThrow(/memory/);
  });

  it("round-trips a custom factory", async () => {
    registerRuntime("fake-rt", () => {
      throw new Error("constructor called");
    });
    expect(listRuntimes()).toContain("fake-rt");
    await expect(loadRuntime("fake-rt")).rejects.toThrow("constructor called");
  });
});
