# open-kernel

The small part that separate Open World products must do identically if
they are to read each other's records, and nothing else.

- [`CONTRACT.md`](CONTRACT.md) is the contract: ten rules, in words.
- `vectors/` are the contract's test vectors: an input and the only right
  answer. An implementation in any language obeys the contract when it
  gives these answers.
- `src/` is a reference implementation in TypeScript.

```
src/ids.ts         ULIDs
src/canonical.ts   canonical JSON (contract §1)
src/hash.ts        SHA-256 of an event; the 64 zeros a record starts from (§1)
src/envelope.ts    the ten-field event envelope, with each product's own actor (§2)
src/chain.ts       checking a log; reading and writing a log file (§1, §2)
src/frames.ts      hello, welcome, ev, eph, act, ack, ping, pong; the reasons an action is refused (§4)
src/rules.ts       when, where, do: matching a rule against an event (§6)
src/bridge.ts      the device bridge's four messages and the device vocabulary (§7)
```

## What is not here

No event types but `device.*`. No state, no reducer, no roles. No clock, no
randomness, no network. Nothing that belongs to any one product. A test
(`test/standalone.test.ts`) fails if any of that arrives, or if the kernel
comes to depend on anything but a schema library and a hashing library.

## The vectors

| File | Says |
|---|---|
| `vectors/canonical.json` | This JSON text; its canonical form; the SHA-256 of that |
| `vectors/ulid.json` | This time and these ten bytes make this id |
| `vectors/events.json` | This event has this hash |
| `vectors/logs/demo.jsonl` | A whole record, one canonical event a line. `demo.expected.json` gives its length and final hash |
| `vectors/chain-faults.json` | That record broken fifteen ways, each with the fault that must be reported and where |
| `vectors/rules.json` | This rule and this event: match, or not. And things that are not rules |
| `vectors/bridge.json` | Lines a bridge must read, lines it must refuse, and which counters are fresh |
| `vectors/frames.json` | Frames a client may send, frames it may not, and the ten reasons for refusal |

The expected values were written by `vectors/make.py`, a second
implementation of the contract in Python that shares no code with `src/`.
`test/vectors.test.ts` holds the TypeScript to them. When the two disagree,
one of them has the contract wrong. The build runs `make.py` again and
fails if a single byte of the vectors would change.

## Working on it

```bash
pnpm install
pnpm check      # typecheck, then the kernel against the vectors
pnpm vectors    # write the vectors again; only when the contract changes
```

Node 22 or later, pnpm 12, Python 3 for the vectors. The package exports its
TypeScript source directly; there is no build step.

## Using it in a product

A product keeps a copy of this repository's files, pinned to a commit, and
checks that the copy has not been altered. It builds its own envelope from
`envelope(actor)`, its own frames from `welcomeFrame` and `evFrame`, and
checks its logs with `verifyChain` and its own event parser. It never
changes the copy: a change is made here, and every product takes it.

## Contact

Questions, or building something against the contract? Open an issue here,
or write to Atlas Talisman at atlastalisman@protonmail.com.

## Licence

Apache License 2.0: see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Anyone
may use, change and share this, including in closed products. The licence
grants no right to use the names Open World or Clown Pi.

Published openly by Open World, 17 November 2026.
