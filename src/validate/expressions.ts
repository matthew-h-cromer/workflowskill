import jsonata from "jsonata";

export interface ExpressionCheckError {
  message: string;
}

/**
 * Parse-only check for a JSONata expression. The jsonata library throws at
 * construction time on syntax errors, so building the expression without
 * evaluating is a pure static check.
 */
export function checkJsonata(expr: string): ExpressionCheckError | null {
  try {
    jsonata(expr);
    return null;
  } catch (err) {
    return { message: err instanceof Error ? err.message : String(err) };
  }
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
