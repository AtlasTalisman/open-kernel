import { z } from "zod";

// ULID: 48 bits of time, 80 bits of randomness, Crockford base 32.
// Sorts by time as a string, which is why it is the primary key everywhere.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const MAX_TIME = 2 ** 48 - 1;

export const Ulid = z.string().regex(ULID_RE, "not a ULID");
export type Ulid = z.infer<typeof Ulid>;

export function isUlid(value: unknown): value is Ulid {
  return typeof value === "string" && ULID_RE.test(value);
}

function encode(value: number, length: number): string {
  let out = "";
  let rest = value;
  for (let i = 0; i < length; i++) {
    out = ALPHABET[rest % 32] + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

/** Five bytes are forty bits, which fit a double exactly and make eight characters. */
function encodeFiveBytes(bytes: Uint8Array, offset: number): string {
  const high = bytes[offset]!;
  const low =
    ((bytes[offset + 1]! << 24) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 8) | bytes[offset + 4]!) >>> 0;
  return encode(high * 2 ** 32 + low, 8);
}

export function encodeUlid(timeMs: number, random: Uint8Array): Ulid {
  if (!Number.isInteger(timeMs) || timeMs < 0 || timeMs > MAX_TIME) {
    throw new RangeError(`ULID time out of range: ${timeMs}`);
  }
  if (random.length !== 10) throw new RangeError("ULID needs exactly 10 random bytes");
  return encode(timeMs, 10) + encodeFiveBytes(random, 0) + encodeFiveBytes(random, 5);
}

/** The millisecond timestamp inside a ULID. */
export function ulidTime(id: string): number {
  if (!isUlid(id)) throw new TypeError(`not a ULID: ${id}`);
  let time = 0;
  for (let i = 0; i < 10; i++) time = time * 32 + ALPHABET.indexOf(id[i]!);
  return time;
}

export type UlidFactory = (timeMs: number) => Ulid;

/**
 * A monotonic ULID source. The caller supplies the entropy, so this module
 * holds no randomness of its own and a seeded source gives reproducible ids.
 * Two ids minted in the same millisecond (or after the clock steps back)
 * still sort in the order they were minted.
 */
export function ulidFactory(randomBytes: (length: number) => Uint8Array): UlidFactory {
  let lastTime = -1;
  let lastRandom = new Uint8Array(10);
  return (timeMs) => {
    if (timeMs > lastTime) {
      lastTime = timeMs;
      lastRandom = Uint8Array.from(randomBytes(10));
      if (lastRandom.length !== 10) throw new RangeError("entropy source returned the wrong length");
    } else {
      const next = Uint8Array.from(lastRandom);
      let i = 9;
      while (i >= 0) {
        if (next[i] === 0xff) {
          next[i] = 0;
          i--;
        } else {
          next[i] = next[i]! + 1;
          break;
        }
      }
      if (i < 0) throw new RangeError("ULID randomness overflowed within one millisecond");
      lastRandom = next;
    }
    return encodeUlid(lastTime, lastRandom);
  };
}
