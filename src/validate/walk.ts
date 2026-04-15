import type { Step } from "../schema/steps.js";

export interface StepNode {
  step: Step;
  path: string;
  siblings: Step[];
  /** Ids visible to this step: outer scopes + earlier siblings. */
  inScopeIds: ReadonlySet<string>;
}

export interface ExpressionNode {
  /** The raw expression text (bare JSONata — no `{{ }}` delimiters). */
  expr: string;
  path: string;
  inScopeIds: ReadonlySet<string>;
}

export type StepVisitor = (node: StepNode) => void;
export type ExpressionVisitor = (node: ExpressionNode) => void;

/**
 * Walk every step in the tree in deterministic order.
 * Calls the visitor with sibling context and the set of step ids visible
 * at that location (outer scopes + earlier siblings in the same block).
 */
export function walkSteps(
  steps: Step[],
  basePath: string,
  visitor: StepVisitor,
  outerIds: ReadonlySet<string> = new Set(),
): void {
  const localIds = new Set<string>();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    const path = `${basePath}[${i}]`;
    const inScope = new Set<string>([...outerIds, ...localIds]);
    visitor({ step, path, siblings: steps, inScopeIds: inScope });
    // After visiting, the id becomes visible to following siblings.
    localIds.add(step.id);

    const childOuter = new Set<string>([...outerIds, ...localIds]);

    switch (step.type) {
      case "if":
        walkSteps(step.then, `${path}.then`, visitor, childOuter);
        if (step.else) walkSteps(step.else, `${path}.else`, visitor, childOuter);
        break;
      case "switch":
        for (const [name, body] of Object.entries(step.cases)) {
          walkSteps(body as Step[], `${path}.cases.${name}`, visitor, childOuter);
        }
        if (step.default) walkSteps(step.default, `${path}.default`, visitor, childOuter);
        break;
      case "foreach":
        walkSteps(step.body, `${path}.body`, visitor, childOuter);
        break;
      case "while":
        walkSteps(step.body, `${path}.body`, visitor, childOuter);
        break;
      case "parallel":
        for (const [name, body] of Object.entries(step.branches)) {
          walkSteps(body as Step[], `${path}.branches.${name}`, visitor, childOuter);
        }
        break;
      case "try":
        walkSteps(step.body, `${path}.body`, visitor, childOuter);
        if (step.catch) walkSteps(step.catch, `${path}.catch`, visitor, childOuter);
        if (step.finally) walkSteps(step.finally, `${path}.finally`, visitor, childOuter);
        break;
    }
  }
}

/**
 * Visit every expression in a step. All expressions are JSONata:
 * predicates (if.when, while.when, switch.on), transform.expr, and
 * foreach.items uses `{{ }}` template syntax; everything else lives in `{{ }}` template
 * spans — the visitor receives the already-extracted span contents,
 * one call per span.
 */
export function visitStepExpressions(node: StepNode, visit: ExpressionVisitor): void {
  const { step, path, inScopeIds } = node;

  const emitTemplate = (value: unknown, subPath: string): void => {
    if (typeof value === "string") {
      for (const expr of extractSpans(value)) {
        visit({ expr, path: subPath, inScopeIds });
      }
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        emitTemplate(v, `${subPath}.${k}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => emitTemplate(v, `${subPath}[${i}]`));
    }
  };

  switch (step.type) {
    case "action":
      if (step.with) emitTemplate(step.with, `${path}.with`);
      break;
    case "transform":
      visit({ expr: step.expr, path: `${path}.expr`, inScopeIds });
      break;
    case "if":
      visit({ expr: step.when, path: `${path}.when`, inScopeIds });
      break;
    case "switch":
      visit({ expr: step.on, path: `${path}.on`, inScopeIds });
      break;
    case "foreach":
      emitTemplate(step.items, `${path}.items`);
      break;
    case "while":
      visit({ expr: step.when, path: `${path}.when`, inScopeIds });
      break;
    case "return":
      emitTemplate(step.value, `${path}.value`);
      break;
    case "wait":
      if (step.until !== undefined) emitTemplate(step.until, `${path}.until`);
      break;
    case "wait_for_signal":
      if (step.match) emitTemplate(step.match, `${path}.match`);
      break;
  }
}

/** Extract the contents of every `{{ ... }}` span in a template string. */
export function extractSpans(template: string): string[] {
  const SPAN_RE = /\{\{(.+?)\}\}/gs;
  const out: string[] = [];
  for (const match of template.matchAll(SPAN_RE)) {
    const inner = match[1];
    if (inner !== undefined) out.push(inner.trim());
  }
  return out;
}
