import { describe, it, expect } from 'vitest';

// Dynamically import so the module isn't cached between tests
async function loadPlugin() {
  // Use a fresh import each time via cache-busting is not needed in vitest
  // since vitest isolates modules per test file by default
  const mod = await import('../../openclaw/index.js');
  return mod.default;
}

describe('WorkflowSkill plugin register()', () => {
  it('throws with a descriptive error when config.agents.defaults.workspace is undefined', async () => {
    const plugin = await loadPlugin();
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugin.register({ config: {}, registerTool: () => {} } as any),
    ).toThrow(/WorkflowSkill plugin requires a valid workspace path/);
  });

  it('throws when workspace is empty string', async () => {
    const plugin = await loadPlugin();
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugin.register({ config: { agents: { defaults: { workspace: '' } } }, registerTool: () => {} } as any),
    ).toThrow(/WorkflowSkill plugin requires a valid workspace path/);
  });

  it('error message includes the received value', async () => {
    const plugin = await loadPlugin();
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugin.register({ config: {}, registerTool: () => {} } as any),
    ).toThrow(/Received:/);
  });

  it('registers all 3 tools when workspace is a valid path', async () => {
    const plugin = await loadPlugin();
    const registered: string[] = [];
    plugin.register({
      config: { agents: { defaults: { workspace: '/tmp/test-workspace' } } },
      registerTool: (spec) => {
        registered.push(spec.name);
      },
      invokeTool: async () => ({ content: [] }),
      hasTool: () => false,
      completion: async () => ({ content: [] }),
    });
    expect(registered).toHaveLength(3);
    expect(registered).toContain('workflowskill_validate');
    expect(registered).toContain('workflowskill_run');
    expect(registered).toContain('workflowskill_runs');
  });

  it('plugin has id "workflowskill"', async () => {
    const plugin = await loadPlugin();
    expect(plugin.id).toBe('workflowskill');
  });
});
