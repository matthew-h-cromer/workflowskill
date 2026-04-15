import type { Runtime } from "./protocol.js";

export type RuntimeFactory = () => Promise<Runtime> | Runtime;

const registry: Record<string, RuntimeFactory> = {
  memory: async () => {
    const { InMemoryRuntime } = await import("./memory.js");
    return new InMemoryRuntime();
  },
};

export function registerRuntime(name: string, factory: RuntimeFactory): void {
  registry[name] = factory;
}

export function listRuntimes(): string[] {
  return Object.keys(registry);
}

export async function loadRuntime(name: string): Promise<Runtime> {
  const factory = registry[name];
  if (!factory) {
    const known = listRuntimes().join(", ");
    throw new Error(`Unknown runtime: "${name}". Registered runtimes: ${known}`);
  }
  return await factory();
}
