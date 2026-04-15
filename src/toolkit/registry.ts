import type { Toolkit } from "./protocol.js";

export type ToolkitFactory = () => Promise<Toolkit> | Toolkit;

const registry: Record<string, ToolkitFactory> = {
  weldable: async () => {
    const { WeldableMockToolkit } = await import("./weldable/mock.js");
    return new WeldableMockToolkit();
  },
};

export function registerToolkit(name: string, factory: ToolkitFactory): void {
  registry[name] = factory;
}

export function listToolkits(): string[] {
  return Object.keys(registry);
}

export async function loadToolkit(name: string): Promise<Toolkit> {
  const factory = registry[name];
  if (!factory) {
    const known = listToolkits().join(", ");
    throw new Error(`Unknown toolkit: "${name}". Registered toolkits: ${known}`);
  }
  return await factory();
}
