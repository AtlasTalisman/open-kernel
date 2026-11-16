// Canonical JSON: one byte sequence per value, whatever runtime produced it.
// Object keys are sorted by UTF-16 code unit (as RFC 8785 does), there is no
// whitespace, and keys holding undefined are left out. Numbers use the
// ECMAScript number-to-string algorithm, which every engine implements
// identically. Everything that is hashed goes through here first.

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        let out = "[";
        for (let i = 0; i < value.length; i++) {
          if (value[i] === undefined) throw new TypeError("canonicalJson: undefined inside an array");
          out += (i ? "," : "") + canonicalJson(value[i]);
        }
        return out + "]";
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new TypeError("canonicalJson: only plain objects and arrays can be serialised");
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      let out = "{";
      let first = true;
      for (const key of keys) {
        const item = record[key];
        if (item === undefined) continue;
        out += (first ? "" : ",") + JSON.stringify(key) + ":" + canonicalJson(item);
        first = false;
      }
      return out + "}";
    }
    default:
      throw new TypeError(`canonicalJson: cannot serialise a ${typeof value}`);
  }
}
