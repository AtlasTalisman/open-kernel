import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The kernel knows about nobody. It depends on a schema library and a hashing
// library, and holds nothing that belongs to any one product.

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
const files = readdirSync(new URL("src/", root)).filter((name) => name.endsWith(".ts"));
const ALLOWED = ["zod", "@noble/hashes"];

describe("the kernel stands alone", () => {
  it("depends on a schema library and a hashing library, and nothing else", () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([...ALLOWED].sort());
    for (const version of Object.values({ ...pkg.dependencies, ...pkg.devDependencies })) expect(version).not.toMatch(/^workspace:/);
  });

  it.each(files)("%s imports only those and its own files", (name) => {
    const source = readFileSync(new URL(`src/${name}`, root), "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      const from = match[1]!;
      expect(from.startsWith("./") || ALLOWED.some((allowed) => from === allowed || from.startsWith(`${allowed}/`)), `${name} imports ${from}`).toBe(true);
    }
  });

  it.each(files)("%s names no product", (name) => {
    const source = readFileSync(new URL(`src/${name}`, root), "utf8");
    // No product's own concepts appear.
    expect(source).not.toMatch(/viicariius|spontaneum|\bseat\b|\bpilot\b|\bquest\b|\bguest\b|\bsession\b/i);
  });

  it.each(files)("%s reaches for no clock, no randomness and no network", (name) => {
    const source = readFileSync(new URL(`src/${name}`, root), "utf8");
    expect(source).not.toMatch(/Date\.now|new Date|Math\.random|\bfetch\(|\bprocess\.|crypto\.getRandomValues/);
  });
});
