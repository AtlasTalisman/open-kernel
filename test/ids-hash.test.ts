import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  encodeUlid,
  GENESIS_PREV,
  hashEvent,
  hashJson,
  isUlid,
  sha256Hex,
  ulidFactory,
  ulidTime,
} from "../src";

describe("ulid", () => {
  it("encodes the time as the reference implementation does", () => {
    // From the ULID specification's own example.
    const id = encodeUlid(1469918176385, new Uint8Array(10));
    expect(id.slice(0, 10)).toBe("01ARYZ6S41");
    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBe(true);
    expect(ulidTime(id)).toBe(1469918176385);
  });

  it("encodes the random part five bits at a time", () => {
    const all = encodeUlid(0, new Uint8Array(10).fill(0xff));
    expect(all).toBe("0000000000" + "Z".repeat(16));
    const one = encodeUlid(0, Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]));
    expect(one).toBe("0000000000" + "0".repeat(15) + "1");
  });

  it("refuses a time or entropy it cannot encode", () => {
    expect(() => encodeUlid(-1, new Uint8Array(10))).toThrow(RangeError);
    expect(() => encodeUlid(2 ** 48, new Uint8Array(10))).toThrow(RangeError);
    expect(() => encodeUlid(1, new Uint8Array(9))).toThrow(RangeError);
  });

  it("stays in order within one millisecond and when the clock steps back", () => {
    let calls = 0;
    const next = ulidFactory((n) => {
      calls++;
      return new Uint8Array(n).fill(0xff - calls);
    });
    const a = next(1000);
    const b = next(1000);
    const c = next(999); // clock stepped back
    const d = next(1001);
    expect([a, b, c, d]).toEqual([...[a, b, c, d]].sort());
    expect(new Set([a, b, c, d]).size).toBe(4);
    expect(calls).toBe(2); // fresh entropy only when time moves forward
    expect(ulidTime(c)).toBe(1000);
  });

  it("carries across bytes when incrementing", () => {
    const next = ulidFactory(() => Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff]));
    next(5);
    expect(next(5)).toBe(encodeUlid(5, Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 1, 0, 0])));
  });

  it("rejects look-alike letters and overlong times", () => {
    expect(isUlid("01ARYZ6S41TSV4RRFFQ69G5FAV")).toBe(true);
    expect(isUlid("01ARYZ6S41TSV4RRFFQ69G5FAI")).toBe(false); // I
    expect(isUlid("81ARYZ6S41TSV4RRFFQ69G5FAV")).toBe(false); // > 48 bits
    expect(isUlid("01aryz6s41tsv4rrffq69g5fav")).toBe(false);
  });
});

describe("canonical JSON", () => {
  it("sorts keys at every depth and drops undefined", () => {
    const a = { b: 1, a: { d: [1, { z: 1, y: 2 }], c: null }, gone: undefined };
    const b = { a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe('{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}');
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("writes numbers and strings one way", () => {
    expect(canonicalJson([1, 1.5, -0, 1e21, 0.1 + 0.2])).toBe("[1,1.5,0,1e+21,0.30000000000000004]");
    expect(canonicalJson("a\"b\né\u{1f600}")).toBe('"a\\"b\\né\u{1f600}"');
  });

  it("refuses what JSON cannot hold", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => canonicalJson([undefined])).toThrow(TypeError);
    expect(() => canonicalJson(new Date(0))).toThrow(TypeError);
    expect(() => canonicalJson(new Map())).toThrow(TypeError);
    expect(() => canonicalJson(() => 1)).toThrow(TypeError);
    expect(() => canonicalJson(1n)).toThrow(TypeError);
  });
});

describe("sha-256", () => {
  it("matches the standard test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("hashes text as UTF-8", () => {
    // printf "é" | shasum -a 256
    expect(sha256Hex("é")).toBe("4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c");
  });

  it("hashes a value by its canonical form, whatever the key order", () => {
    expect(hashJson({ a: 1, b: 2 })).toBe(hashJson({ b: 2, a: 1 }));
    expect(hashJson({ a: 1, b: 2 })).toBe(sha256Hex('{"a":1,"b":2}'));
    expect(hashEvent({ a: 1 })).not.toBe(hashEvent({ a: 2 }));
  });

  it("starts every chain from the same place", () => {
    expect(GENESIS_PREV).toMatch(/^0{64}$/);
  });
});
