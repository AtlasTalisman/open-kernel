import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AckError,
  canonicalJson,
  encodeUlid,
  freshCount,
  GENESIS_PREV,
  hashEvent,
  isUlid,
  matchRule,
  MAX_RULE_DEPTH,
  parseAnyEnvelope,
  parseBridgeLine,
  parseClientFrame,
  parseLog,
  formatLog,
  Rule,
  sha256Hex,
  ulidTime,
  verifyChain,
} from "../src";

// The contract's vectors (../vectors). Their expected values were written by
// a second implementation, in Python, that shares no code with this one
// (vectors/make.py). An implementation in any language obeys the contract
// when it gives these answers.

const dir = new URL("../vectors/", import.meta.url);
const text = (name: string) => readFileSync(new URL(name, dir), "utf8");
const json = <T>(name: string) => JSON.parse(text(name)) as T;
const hex = (value: string) => Uint8Array.from(value.match(/../g)!.map((byte) => parseInt(byte, 16)));

describe("canonical form and hash (contract §1)", () => {
  const cases = json<{ name: string; json: string; canonical: string; sha256: string }[]>("canonical.json");
  it.each(cases)("$name", (c) => {
    const canonical = canonicalJson(JSON.parse(c.json));
    expect(canonical).toBe(c.canonical);
    expect(sha256Hex(canonical)).toBe(c.sha256);
    // Canonical form is a fixed point: writing it again changes nothing.
    expect(canonicalJson(JSON.parse(canonical))).toBe(canonical);
  });

  it("has enough cases to mean something", () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
  });
});

describe("ids", () => {
  it.each(json<{ timeMs: number; randomHex: string; ulid: string }[]>("ulid.json"))("$ulid", (c) => {
    expect(encodeUlid(c.timeMs, hex(c.randomHex))).toBe(c.ulid);
    expect(isUlid(c.ulid)).toBe(true);
    expect(ulidTime(c.ulid)).toBe(c.timeMs);
  });
});

describe("the envelope and its hash (contract §2)", () => {
  it.each(json<{ name: string; event: unknown; hash: string }[]>("events.json"))("$name", (c) => {
    expect(parseAnyEnvelope(c.event).ok).toBe(true);
    expect(hashEvent(c.event)).toBe(c.hash);
  });
});

describe("whole logs", () => {
  const logs = readdirSync(new URL("logs/", dir)).filter((name) => name.endsWith(".jsonl"));

  it.each(logs)("%s verifies to its published head", (name) => {
    const raw = parseLog(text(`logs/${name}`));
    const expected = json<{ count: number; seq: number; head: string }>(`logs/${name.replace(".jsonl", ".expected.json")}`);
    const check = verifyChain(raw, parseAnyEnvelope);
    expect(check).toMatchObject({ ok: true, ...expected });
    // A log file is canonical line by line: writing it out again gives the same bytes.
    expect(formatLog(raw)).toBe(text(`logs/${name}`));
  });

  it("includes a log that belongs to no product", () => {
    expect(logs).toContain("demo.jsonl");
  });

  it("can be checked in pieces, carrying on from where the last piece ended", () => {
    const raw = parseLog(text("logs/demo.jsonl"));
    const first = verifyChain(raw.slice(0, 3), parseAnyEnvelope);
    if (!first.ok) throw new Error(first.error);
    const last = first.events.at(-1)!;
    const rest = verifyChain(raw.slice(3), parseAnyEnvelope, { seq: first.seq, t: last.t, head: first.head, id: last.id });
    expect(rest).toMatchObject({ ok: true, head: json<{ head: string }>("logs/demo.expected.json").head });
  });

  it("starts from 64 zeros", () => {
    expect(GENESIS_PREV).toBe("0".repeat(64));
    expect((parseLog(text("logs/demo.jsonl"))[0] as { prev: string }).prev).toBe(GENESIS_PREV);
  });
});

describe("a broken log is refused, and the fault is named", () => {
  it.each(json<{ name: string; code: string; index: number; log: unknown[] }[]>("chain-faults.json"))("$name", (c) => {
    const check = verifyChain(c.log, parseAnyEnvelope);
    expect(check).toMatchObject({ ok: false, code: c.code, index: c.index });
  });
});

describe("rules (contract §6)", () => {
  const rules = json<{ match: { name: string; rule: unknown; event: { type: string; p: unknown }; match: boolean }[]; invalid: { name: string; rule: unknown }[]; maxDepth: number }>("rules.json");

  it.each(rules.match)("$name", (c) => {
    expect(matchRule(Rule.parse(c.rule), c.event)).toBe(c.match);
  });

  it.each(rules.invalid)("is not a rule: $name", (c) => {
    expect(Rule.safeParse(c.rule).success).toBe(false);
  });

  it("stops a chain of rules at the agreed depth", () => {
    expect(MAX_RULE_DEPTH).toBe(rules.maxDepth);
  });
});

describe("the device bridge (contract §7)", () => {
  const bridge = json<{ valid: string[]; invalid: { name: string; line: string }[]; counters: { last: number; n: number; fresh: boolean }[] }>("bridge.json");

  it.each(bridge.valid)("reads %s", (line) => {
    expect(parseBridgeLine(line)).not.toBeNull();
  });

  it.each(bridge.invalid)("refuses $name", (c) => {
    expect(parseBridgeLine(c.line)).toBeNull();
  });

  it.each(bridge.counters)("after $last, $n is fresh: $fresh", (c) => {
    expect(freshCount(c.last, c.n)).toBe(c.fresh);
  });
});

describe("frames (contract §4)", () => {
  const frames = json<{ client: { valid: string[]; invalid: { name: string; frame: string }[] }; refusals: string[] }>("frames.json");

  it.each(frames.client.valid)("a client may send %s", (frame) => {
    expect(parseClientFrame(frame)).not.toBeNull();
  });

  it.each(frames.client.invalid)("a client may not send: $name", (c) => {
    expect(parseClientFrame(c.frame)).toBeNull();
  });

  it("has the agreed reasons for refusing an action, and no others", () => {
    expect([...AckError.options]).toEqual(frames.refusals);
  });
});
