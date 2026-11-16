import { z } from "zod";
import { Ulid } from "./ids";

// The event envelope (contract §2). Ten fields, the same in every product.
// What is inside `actor` beyond its role, and everything inside `p`, belongs
// to the product whose record it is.

/** Envelope version. A change that would alter a hash is a new version, and the old one is read for ever. */
export const EVENT_VERSION = 1 as const;

export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "a SHA-256 in lower-case hex expected");
export const RecordId = z.string().min(1).max(64);
const Ms = z.number().int().nonnegative();

export type WireEvent<T extends string = string, P = unknown, A = { role: string }> = {
  id: string; //         ULID, minted by the authority
  sid: string; //        the record this belongs to
  seq: number; //        gapless within the record, from 1
  t: number; //          the authority's clock, ms since epoch
  wt: number | null; //  when it really happened, if that was earlier
  actor: A;
  type: T; //            dotted, family first: "poll.closed"
  v: 1;
  p: P; //               checked against the product's catalogue, not here
  prev: string; //       SHA-256 of the whole previous event (contract §1)
};

/**
 * The envelope schema for one product: its own actor, and its own rule for
 * a record id if it has one. The payload is left unchecked; a product checks
 * it against its catalogue.
 */
export function envelope<A extends z.ZodType, S extends z.ZodType<string> = typeof RecordId>(actor: A, sid?: S) {
  return z.strictObject({
    id: Ulid,
    sid: (sid ?? RecordId) as S,
    seq: z.number().int().positive(),
    t: Ms,
    wt: Ms.nullable(),
    actor,
    type: z.string().min(3).max(64),
    v: z.literal(EVENT_VERSION),
    p: z.unknown(),
    prev: Sha256,
  });
}

/** The least every actor says: a role. A product's own actor says more. */
export const AnyActor = z.looseObject({ role: z.string().min(1).max(32) });

/** An envelope from any product: enough to check a chain without knowing whose record it is. */
export const AnyEnvelope = envelope(AnyActor);
export type AnyEnvelope = z.infer<typeof AnyEnvelope>;

/** The family of a type: the part before the first dot. */
export function familyOf(type: string): string {
  const dot = type.indexOf(".");
  return dot < 0 ? type : type.slice(0, dot);
}
