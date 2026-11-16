import { z } from "zod";

// The wire protocol (contract §4): JSON frames, `{ k: kind, ... }`. An
// action is a request; `cid` makes a retry harmless; a client resumes by
// saying the last sequence number it has. What a `welcome` carries and which
// actions exist are each product's own.

/** Why an action was refused. Sent in `ack.err`. */
export const AckError = z.enum([
  "bad_frame", //    not a frame this protocol knows
  "bad_action", //   unknown action, or a payload that fails its schema
  "no_ticket", //    hello has not succeeded on this connection
  "expired", //      the ticket has run out; say hello again with a new one
  "forbidden", //    the ticket lacks the capability
  "state", //        the record is not in a state where this can happen
  "conflict", //     someone or something else got there first
  "not_found",
  "rate", //         too many, too fast
  "internal",
]);
export type AckError = z.infer<typeof AckError>;

// client -> authority

/** Authenticate; resume from a sequence number. */
export const HelloFrame = z.strictObject({
  k: z.literal("hello"),
  ticket: z.string().min(1).max(4096),
  lastSeq: z.number().int().nonnegative().nullable(), // null: send me a snapshot
});
export type HelloFrame = z.infer<typeof HelloFrame>;

/** A requested action; `cid` makes retries safe. */
export const ActFrame = z.strictObject({
  k: z.literal("act"),
  cid: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  p: z.unknown(),
});
export type ActFrame = z.infer<typeof ActFrame>;

// authority -> client

/**
 * Snapshot plus the capabilities the ticket grants. `state` is null when the
 * client resumed from `lastSeq`: it keeps the state it has, and the events
 * it missed follow in an `ev` frame.
 */
export function welcomeFrame<S extends z.ZodType, C extends z.ZodType>(state: S, cap: C) {
  return z.strictObject({
    k: z.literal("welcome"),
    state: state.nullable(),
    seq: z.number().int().nonnegative(),
    caps: z.array(cap),
  });
}

/** Stored events in order. */
export function evFrame<E extends z.ZodType>(event: E) {
  return z.strictObject({ k: z.literal("ev"), events: z.array(event).min(1) });
}

/** Ephemeral: never stored. Tallies, presence, someone typing. */
export const EphFrame = z.strictObject({ k: z.literal("eph"), type: z.string().min(1).max(64), p: z.unknown() });
export type EphFrame = z.infer<typeof EphFrame>;

/** Outcome of an action. */
export const AckFrame = z.strictObject({
  k: z.literal("ack"),
  cid: z.string().min(1).max(64),
  ok: z.boolean(),
  seq: z.number().int().positive().optional(), // the last event the action produced
  err: AckError.optional(),
  detail: z.string().max(500).optional(), // for a developer; never shown as it is
});
export type AckFrame = z.infer<typeof AckFrame>;

// both

export const PingFrame = z.strictObject({ k: z.literal("ping") });
export const PongFrame = z.strictObject({ k: z.literal("pong") });

/** Every frame a client may send. The same in every product. */
export const ClientFrame = z.discriminatedUnion("k", [HelloFrame, ActFrame, PingFrame, PongFrame]);
export type ClientFrame = z.infer<typeof ClientFrame>;

/** JSON.parse that never throws. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Parse a text frame from a client. Returns null if it is not one. */
export function parseClientFrame(text: string): ClientFrame | null {
  const parsed = ClientFrame.safeParse(parseJson(text));
  return parsed.success ? parsed.data : null;
}
