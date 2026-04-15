import { z } from "zod";

/**
 * A JSONata expression string.
 * Used in `{{ ... }}` interpolation positions and `expr:` fields.
 */
export const JsonataExprSchema = z.string().brand("JsonataExpr");
export type JsonataExpr = z.infer<typeof JsonataExprSchema>;

/**
 * A duration string. Format: <integer><unit> where unit is s, m, h, d.
 * Examples: "30s", "5m", "24h", "7d"
 */
export const DurationSchema = z
  .string()
  .regex(
    /^\d+(ms|[smhd])$/,
    'Duration must be a number followed by ms, s, m, h, or d (e.g. "5m", "24h", "500ms")',
  );
export type Duration = z.infer<typeof DurationSchema>;

/**
 * Rate limit `per` values. Only these three units are supported.
 */
export const RateLimitPerSchema = z.enum(["1s", "1m", "1h"]);
export type RateLimitPer = z.infer<typeof RateLimitPerSchema>;

/** Parse a duration string into milliseconds. */
export function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)(ms|[smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const value = Number.parseInt(match[1] ?? "0", 10);
  const unit = match[2];
  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1_000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    case "d":
      return value * 86_400_000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/** Parse a RateLimitPer string into milliseconds. */
export function parseRateLimitPerMs(per: RateLimitPer): number {
  switch (per) {
    case "1s":
      return 1_000;
    case "1m":
      return 60_000;
    case "1h":
      return 3_600_000;
  }
}
