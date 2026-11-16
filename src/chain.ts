import { canonicalJson } from "./canonical";
import { AnyEnvelope } from "./envelope";
import { GENESIS_PREV, hashEvent } from "./hash";
import { z } from "zod";

// Checking a record (contract §1, §6.2). Anyone who holds a log can run
// this: it needs no key, no network and no knowledge of the product.

export type Parsed<E> = { ok: true; event: E } | { ok: false; error: string };

/** Where a check left off, to carry on from. */
export type ChainPosition = { seq: number; t: number; head: string; id: string };

/** Why a log failed: which of the chain's promises was broken. */
export type ChainFault = "shape" | "record" | "seq" | "time" | "id" | "prev";

export type ChainCheck<E> =
  | { ok: true; count: number; seq: number; head: string; events: E[] }
  | { ok: false; index: number; code: ChainFault; error: string };

type Link = { id: string; sid: string; seq: number; t: number; prev: string };

/** Parse an envelope from any product. Its payload is not looked at. */
export function parseAnyEnvelope(raw: unknown): Parsed<AnyEnvelope> {
  const parsed = AnyEnvelope.safeParse(raw);
  return parsed.success ? { ok: true, event: parsed.data } : { ok: false, error: z.prettifyError(parsed.error) };
}

/**
 * Check a log: every event is well formed, all belong to one record, numbers
 * run without a gap, the authority's time and ids never go backwards, and
 * each event's `prev` is the SHA-256 of the event before it. `head` is the
 * hash of the last event: the record's final hash once it has ended.
 *
 * `parse` is the product's own check of one event. Pass `after` to check a
 * continuation of a log already checked.
 */
export function verifyChain<E extends Link>(raw: readonly unknown[], parse: (raw: unknown) => Parsed<E>, after?: ChainPosition): ChainCheck<E> {
  let seq = after?.seq ?? 0;
  let t = after?.t ?? 0;
  let head = after?.head ?? GENESIS_PREV;
  let id = after?.id ?? "";
  let sid: string | null = null;
  const events: E[] = [];
  for (let index = 0; index < raw.length; index++) {
    const fail = (code: ChainFault, error: string): ChainCheck<E> => ({ ok: false, index, code, error });
    const parsed = parse(raw[index]);
    if (!parsed.ok) return fail("shape", parsed.error);
    const event = parsed.event;
    if (sid !== null && event.sid !== sid) return fail("record", `event belongs to record ${event.sid}, not ${sid}`);
    if (event.seq !== seq + 1) return fail("seq", `seq ${event.seq} where ${seq + 1} was expected`);
    if (event.t < t) return fail("time", `the authority's time runs backwards at seq ${event.seq}`);
    if (event.id <= id) return fail("id", `id out of order at seq ${event.seq}`);
    if (event.prev !== head) return fail("prev", `chain broken at seq ${event.seq}: prev does not match the event before`);
    sid = event.sid;
    seq = event.seq;
    t = event.t;
    id = event.id;
    // The hash is of what was stored, not of what the parser made of it.
    head = hashEvent(raw[index]);
    events.push(event);
  }
  return { ok: true, count: raw.length, seq, head, events };
}

/** A log as text: one canonical JSON event per line. */
export function formatLog(events: readonly unknown[]): string {
  return events.map((event) => canonicalJson(event) + "\n").join("");
}

export function parseLog(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() !== "") out.push(JSON.parse(line));
  }
  return out;
}
