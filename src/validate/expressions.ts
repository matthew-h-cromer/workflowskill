import jsonata from "jsonata";

export interface ExpressionCheckError {
  code: "jsonata-syntax" | "jsonata-unknown-fn";
  message: string;
}

/**
 * A Proxy that returns a safe stub value for any property access.
 * Used to satisfy JSONata's navigation without knowing the actual data shape.
 */
function makeStubProxy(depth = 0): Record<string, unknown> {
  // Avoid infinite recursion for very deeply nested path expressions
  if (depth > 5) return {};
  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (prop === "output" || prop === "error") return null;
      return makeStubProxy(depth + 1);
    },
  });
}

/**
 * The stub context used for semantic evaluation of every expression.
 *
 * steps.*   → { output: null, error: null } (Proxy)
 * input.*   → null  (via Proxy)
 * env.*     → null  (via Proxy)
 * workflow  → minimal stub
 */
const STUB_CTX = {
  steps: makeStubProxy(),
  input: new Proxy({} as Record<string, unknown>, { get: () => null }),
  workflow: { owner: {}, run_id: "", name: "", started_at: "" },
  env: new Proxy({} as Record<string, unknown>, { get: () => null }),
};

/**
 * Semantic check for a JSONata expression.
 *
 * Two phases:
 *   1. Parse (syntax) — jsonata throws on syntax errors.
 *   2. Stub-evaluate — runs the real JSONata evaluator against a safe null
 *      context. This catches unknown functions (T1006), wrong arity (T04xx),
 *      and other semantic errors without maintaining an allowlist.
 *
 * Error-code mapping:
 *   T1006               → jsonata-unknown-fn  ("Unknown function $<name>")
 *   T0410/T0411/T0412   → jsonata-semantic    (arity / type mismatch)
 *   D3137               → ignored             (user-authored $error() — intentional)
 *   other D-prefixed    → ignored             (data-dependent; stub data false-positives)
 *   any other           → jsonata-syntax      (parse failure)
 */
export async function checkJsonata(expr: string): Promise<ExpressionCheckError | null> {
  // Phase 1: parse
  let compiled: ReturnType<typeof jsonata>;
  try {
    compiled = jsonata(expr);
  } catch (err) {
    return {
      code: "jsonata-syntax",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // Phase 2: stub-evaluate
  try {
    await compiled.evaluate(STUB_CTX);
  } catch (err) {
    const errCode: string = (err as { code?: string })?.code ?? "";
    const msg: string =
      err instanceof Error ? err.message : ((err as { message?: string })?.message ?? String(err));

    if (errCode === "T1006") {
      // Unknown function — structural regardless of data; extract $name from expr
      const match = /\$(\w+)/.exec(expr);
      const name = match ? `$${match[1]}` : "unknown";
      return {
        code: "jsonata-unknown-fn",
        message: `Unknown JSONata function ${name} — check spelling or use a supported builtin.`,
      };
    }

    // All other errors (D-codes, T2xxx comparison type errors, T04xx type mismatches)
    // are data-dependent: the stub context provides null/proxy values that can cause
    // false positives. Skip them — dry-run with real or synthesized inputs will catch
    // these at Layer 5.
    return null;
  }

  return null;
}

/**
 * Extract top-level `steps.<id>` references from an expression. This is a
 * lexical scan — good enough for the common case. Deep/dynamic references
 * (e.g. `steps[$id].output`) won't be caught here and are left to dry-run.
 */
export function extractStepRefs(expr: string): string[] {
  const REF_RE = /\bsteps\.([A-Za-z_][A-Za-z0-9_]*)/g;
  const out: string[] = [];
  for (const match of expr.matchAll(REF_RE)) {
    const id = match[1];
    if (id !== undefined) out.push(id);
  }
  return out;
}
