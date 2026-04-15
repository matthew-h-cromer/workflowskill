import type { Step } from "../schema/steps.js";
import { walkSteps } from "../validate/walk.js";

/**
 * Validate semantic constraints that can't be expressed in Zod schemas
 * (currently: id uniqueness within lexical scopes).
 *
 * Returns a list of error messages. Empty means valid.
 */
export function validateSteps(steps: Step[]): string[] {
  return validateIdUniqueness(steps);
}

/**
 * Step ids must be unique among siblings, and a body id may not shadow an
 * outer scope id. walkSteps tracks the in-scope id set for us; we just need
 * to also track same-scope siblings seen so far.
 */
export function validateIdUniqueness(steps: Step[]): string[] {
  const errors: string[] = [];
  const seenByPath = new Map<string, Set<string>>();

  walkSteps(steps, "steps", ({ step, path, inScopeIds }) => {
    // Siblings share the same parent path prefix; bucket by removing the `[i]` suffix.
    const parent = path.replace(/\[\d+\]$/, "");
    let siblings = seenByPath.get(parent);
    if (!siblings) {
      siblings = new Set<string>();
      seenByPath.set(parent, siblings);
    }

    if (siblings.has(step.id)) {
      errors.push(`Duplicate step id "${step.id}" among siblings`);
    } else if (inScopeIds.has(step.id)) {
      errors.push(`Step id "${step.id}" shadows an outer scope id — rename to avoid ambiguity`);
    }
    siblings.add(step.id);
  });

  return errors;
}
