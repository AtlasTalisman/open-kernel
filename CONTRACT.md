# The Open World contract

**Version 0.1 · 17 November 2026 · owned and published by Open World**

Ten rules for keeping a record of something that happened live, so that
any program that follows them can read, check and add to a record made by
any other. They were written so that separate products (a questing
platform, a live show, hardware) can stay separate and still work together.

A product obeys the contract when its implementation gives the answers in
`vectors/`. The vectors, not this prose, settle any disagreement about what
a rule means. Rules 1 to 4, 6 and 7 have vectors and a reference
implementation in `src/`. Rules 5, 8, 9 and 10 are agreed in words and are
not yet in the kernel.

**The idea underneath.** A record has exactly one authority. Only the
authority adds to it. Everything anyone sees is drawn from the record.
Products meet by handing each other events, never by sharing state or code:
something from outside enters a record as a request, the authority decides
it, and the authority writes its own event saying what happened and where
it came from.

Words used here: a **record** is one session, show or game. An **authority**
is the one program that may add to a record. An **event** is one entry in a
record. A **product** is whatever defines what the events mean.

---

## 1. Canonical form and hash

An event is hashed as JSON written one way only:

- Object keys are sorted by UTF-16 code unit. This is not the same as
  sorting by character for emoji and a few rare scripts.
- No whitespace.
- Strings as JSON writes them, with characters beyond ASCII written as
  themselves, the short escapes for quote, backslash, newline, tab and
  their kin, and four lower-case hex digits for other control characters.
- Numbers as ECMAScript writes them: `1.0` is `1`, `1e21` is `1e+21`, minus
  zero is `0`. Whole numbers above 9,007,199,254,740,991 do not survive and
  must not be used. Numbers that are not finite cannot be written.
- A field that is null is written. A field that is absent is not. They are
  different and hash differently; nothing may tidy one into the other.

The hash is SHA-256 of that text as UTF-8, written as 64 lower-case hex
characters.

Each event carries `prev`: the hash of the whole previous event, its own
`prev` included. The first event's `prev` is 64 zeros. The hash of the last
event is the record's final hash; publishing it lets anyone see later
whether the record was changed.

Vectors: `canonical.json`, `events.json`.

## 2. Envelope

Every event has these ten fields and no others.

| Field | Is |
|---|---|
| `id` | A ULID, minted by the authority. Later events have later ids |
| `sid` | The record this belongs to. 1 to 64 characters |
| `seq` | A whole number. 1 for the first event, then one more each time, with no gap |
| `t` | The authority's clock when it stored the event, in milliseconds since 1970. Never goes backwards |
| `wt` | When the thing really happened, if that was earlier; otherwise null |
| `actor` | Who did it. An object with a `role`; anything else in it is the product's |
| `type` | What happened. Dotted, family first: `poll.closed`. 3 to 64 characters |
| `v` | The envelope version. `1` |
| `p` | The payload. The product's own, checked against its own catalogue |
| `prev` | Rule 1 |

A change that would alter any hash is a new envelope version. Version 1 is
read for ever.

A log file is one event a line, each in canonical form.

Checking a log looks for these faults, in this order, and reports the first
it finds:

| Fault | Means |
|---|---|
| `shape` | Not an envelope |
| `record` | An event with a different `sid` from the one before |
| `seq` | A number missing, repeated or out of order |
| `time` | `t` earlier than the event before |
| `id` | An id not later than the event before |
| `prev` | `prev` is not the hash of the event before |

Vectors: `logs/`, `chain-faults.json`, `ulid.json`.

## 3. Names

A type is `family.what`. A record's first event names the catalogue its
events belong to, so the same type name may mean different things in
different products' records.

| First event | Catalogue |
|---|---|
| `session.opened` | Viicariius |
| `show.opened` | Spontaneum |
| `experience.opened` | Clown Pi |

A reader that meets a type it does not know keeps the event, includes it in
the chain, and shows nothing for it.

One family means the same thing in every record: `device.*` (rule 7).

## 4. Frames

How a client talks to an authority: JSON objects with a `k` saying which
kind.

| From | Frame | Carries |
|---|---|---|
| Client | `hello` | A ticket, and the last sequence number the client has, or null |
| Authority | `welcome` | The state if the client had none, the current sequence number, what the ticket allows |
| Authority | `ev` | Stored events, in order |
| Authority | `eph` | Something not stored: a tally, a count, someone typing |
| Client | `act` | A request: a `cid`, a type, a payload |
| Authority | `ack` | The answer to a `cid`: accepted or refused, and why |
| Either | `ping`, `pong` | Still here |

- A client never writes to a record. It asks, and the authority decides.
- The same `cid` sent twice gets the same answer and is stored once, for as
  long as the record exists.
- A client that reconnects says the last sequence number it has and is sent
  what it missed, or a fresh state if it is too far behind.
- An action is refused for one of ten reasons: `bad_frame`, `bad_action`,
  `no_ticket`, `expired`, `forbidden`, `state`, `conflict`, `not_found`,
  `rate`, `internal`.

What a `welcome`'s state contains, and which actions exist, are the
product's.

Vectors: `frames.json`.

## 5. Passes and tickets

Two different signed things, both EdDSA. *Agreed; not yet in the kernel.*

- **A pass** says who you are. Open World signs it. It lasts days, and can
  be checked with no internet by anything that holds the public key.
- **A ticket** says what you may do in one record. That record's authority
  signs it. It lasts minutes, and carries a role and a list of capabilities.

An authority never accepts another authority's ticket. Someone known to one
product who wants to take part in another presents a pass, and is given a
ticket by the authority they are talking to, on that authority's terms.

## 6. Rules

```json
{ "on": "device.button", "where": { "dev": "biscuit-01", "press": "single" },
  "do": "show.primary", "args": {} }
```

- Four fields and no others. `where` and `args` may be left out.
- A rule fires when the event's type is exactly `on`, and every field named
  in `where` is present in the event's payload and equal to it.
- `where` holds text, numbers, true, false or null. Equality only: a number
  is not its text, false is not null, and null does not match a field that
  is absent. No expressions, so a rule can always be read aloud.
- A rule's effect may set off another rule, four deep and no further.
- A rule is data. The same rule can run on a device, on a hub or inside an
  authority. What `do` may name is decided by where it runs.
- Inside an authority, a rule's effect is a request like any other and is
  recorded. On a bridge, it is a command sent to a device.

Vectors: `rules.json`.

## 7. Devices

The vocabulary and the bridge are Clown Pi's to define, within this
contract. Every product uses them unchanged.

**What a device may report:** `device.registered`, `device.tapped`,
`device.button`, `device.gesture`, `device.near`, `device.lost`.

**What a device may be asked to do:** `device.ring`, `device.haptic`,
`device.sound`.

**The bridge** is one JSON object a line, the same over a serial cable, a
WebSocket or Bluetooth through a phone.

```json
{"k":"hello","dev":"jf-01","fw":"0.1.0","caps":["nfc","button","ring"]}
{"k":"ev","n":42,"type":"device.button","p":{"dev":"biscuit-01","press":"single"}}
{"k":"do","cid":"c9","to":"biscuit-01","action":"device.haptic","args":{"pattern":"double"}}
{"k":"ack","cid":"c9","ok":true}
```

- `hello` says who the device is, its firmware, and what it can sense and do.
- Every `ev` carries a counter that only goes up. A message whose counter is
  not higher than the last one seen is a repeat or a replay, and is dropped.
  A gap is allowed.
- Each device has its own key. *How a message is signed on a small device
  is not yet settled, and is not in the kernel.*
- A device that goes quiet is reported as `device.lost`, and whatever was
  using it carries on without it.

Vectors: `bridge.json`.

## 8. Segments

*Agreed; not yet in the kernel.*

A segment is a piece of hash-chained history made away from the record it
will join: a header, then entries, each holding the hash of the one before.
There are exactly two ways a segment joins a record.

| | Re-decided | Taken as true |
|---|---|---|
| Who made it | A client: a phone, a device | An authority: a box in a theatre, a hub |
| What the receiver does | Decides each entry as a request, with the sender's ticket, and writes its own events | Checks the chain and stores the events as they are |

Either way an entry is read once, however often it is sent, and an entry
that has been read cannot afterwards be changed, dropped or have another
put before it.

## 9. Citing another record

*Agreed; not yet in the kernel.*

```json
{ "sid": "show_2027_03_01", "seq": 412, "id": "01KH...", "hash": "9c1f..." }
```

Where one record refers to something in another, it uses this and copies
nothing. Anyone who has the other record can check it. Nothing breaks for
anyone who has not.

## 10. The rotating code

*Agreed; not yet in the kernel.*

A short code that proves someone is standing where it is shown. It is made
from a secret the authority holds, what is being claimed, who holds that
now, and the current 30-second window. It is good in its window and the
next, works once, and five wrong tries lock that claim for five minutes.

---

## Changing the contract

Open World owns it. A change that would alter any answer in `vectors/` is a
new version of the contract; a change that would alter a hash is also a new
envelope version (rule 2). Rule 7 changes on Clown Pi's say.
