import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalJson } from "./canonical";

// SHA-256 in plain TypeScript: synchronous and identical in Node, a browser
// and a Worker, so the reducer's hosts never need an async crypto call.

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

/** Hash of any JSON value, by way of its canonical form. */
export function hashJson(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/** `prev` of the first event in every record. */
export const GENESIS_PREV = "0".repeat(64);

/**
 * The link in the chain: the hash of a whole event, its own `prev` included.
 * The next event carries this as `prev`; the last one's is the record's
 * published final hash.
 */
export function hashEvent(event: unknown): string {
  return hashJson(event);
}
