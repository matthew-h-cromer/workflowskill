import { type RateLimitPer, parseRateLimitPerMs } from "../schema/expressions.js";

export interface NormalizedRateLimit {
  max: number;
  perMs: number;
}

export function normalizeRateLimit(
  spec: { max: number; per: string } | undefined,
): NormalizedRateLimit | undefined {
  if (!spec) return undefined;
  return {
    max: spec.max,
    perMs: parseRateLimitPerMs(spec.per as RateLimitPer),
  };
}
