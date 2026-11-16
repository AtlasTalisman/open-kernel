import { z } from "zod";

// Rules (contract §6): when this event, where these fields match, do that.
// A rule is data, so the same rule can run on a device, on a hub or inside
// an authority. What `do` may name is decided by where it runs.

const Scalar = z.union([z.string().max(256), z.number(), z.boolean(), z.null()]);

export const Rule = z.strictObject({
  on: z.string().min(3).max(64), //                          an event type
  where: z.record(z.string().min(1).max(64), Scalar).optional(), // fields of the payload, matched for equality and nothing more
  do: z.string().min(1).max(64), //                          an action the host knows
  args: z.record(z.string().min(1).max(64), z.unknown()).optional(),
});
export type Rule = z.infer<typeof Rule>;

/** A chain of rules stops here: a rule's effect may set off another, this many deep and no further. */
export const MAX_RULE_DEPTH = 4;

/**
 * Does this rule fire for this event? The type must be the same, and every
 * field named in `where` must be present in the payload and equal. No
 * expressions, so a rule can always be read aloud.
 */
export function matchRule(rule: Rule, event: { type: string; p: unknown }): boolean {
  if (rule.on !== event.type) return false;
  if (!rule.where) return true;
  const payload = event.p;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false;
  const fields = payload as Record<string, unknown>;
  for (const [key, wanted] of Object.entries(rule.where)) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) return false;
    if (fields[key] !== wanted) return false;
  }
  return true;
}

/** The rules that fire for an event, in the order they were written. */
export function matchingRules(rules: readonly Rule[], event: { type: string; p: unknown }): Rule[] {
  return rules.filter((rule) => matchRule(rule, event));
}
