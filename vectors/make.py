#!/usr/bin/env python3
"""Writes the contract's test vectors.

This is a second implementation of the contract, in another language and
sharing no code with the kernel. The expected values in the vector files come
from here; the kernel's tests then have to agree with them. Where the two
disagree, one of them has the contract wrong.

Run from anywhere:  python3 vectors/make.py
"""
import hashlib, json, os
from decimal import Decimal

HERE = os.path.dirname(os.path.abspath(__file__))
GENESIS = "0" * 64

# ---------------------------------------------------------------- contract §1

def es_number(x):
    """A number as ECMAScript writes it."""
    if isinstance(x, bool):
        raise TypeError
    if isinstance(x, int):
        return str(x)
    if x == 0:
        return "0"  # and so is minus zero
    d = Decimal(repr(x))
    if 1e-6 <= abs(x) < 1e21:
        s = format(d, "f")
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        return s
    sign, digits, exp = d.as_tuple()
    digits = "".join(map(str, digits)).rstrip("0") or "0"
    e = len(d.as_tuple().digits) + exp - 1
    mant = digits[0] + ("." + digits[1:] if len(digits) > 1 else "")
    return ("-" if sign else "") + mant + "e" + ("+" if e >= 0 else "-") + str(abs(e))

def canonical(v):
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return es_number(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "[" + ",".join(canonical(i) for i in v) + "]"
    if isinstance(v, dict):
        keys = sorted(v.keys(), key=lambda k: k.encode("utf-16-be"))  # by UTF-16 code unit
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + canonical(v[k]) for k in keys) + "}"
    raise TypeError(type(v))

def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def hash_event(e):
    return sha(canonical(e))

# ---------------------------------------------------------------- ULID

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

def ulid(time_ms, random10):
    n = (time_ms << 80) | int.from_bytes(random10, "big")
    return "".join(ALPHABET[(n >> (5 * i)) & 31] for i in range(25, -1, -1))

def write(name, value):
    with open(os.path.join(HERE, name), "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write("\n")

# ---------------------------------------------------------------- canonical.json

CANONICAL = [
    ("empty object", "{}"),
    ("empty array", "[]"),
    ("keys are sorted", '{"b":1,"a":2,"c":3}'),
    ("keys are sorted at every depth", '{"z":{"b":1,"a":[{"y":1,"x":2}]},"a":null}'),
    ("capitals sort before lower case", '{"a":1,"B":2,"A":3,"b":4}'),
    ("digits sort as characters, not numbers", '{"10":1,"9":2,"1":3}'),
    ("keys sort by UTF-16 code unit, not by code point", '{"￮":1,"\U0001F600":2,"z":3}'),
    ("whitespace is removed", ' { "a" : [ 1 , 2 ] ,\n "b" : "x y" } '),
    ("array order is kept", "[3,1,2]"),
    ("null is kept; it is not the same as absent", '{"a":null}'),
    ("true and false", '{"t":true,"f":false}'),
    ("a whole number written with a point", "1.0"),
    ("a whole number written with an exponent", "1e2"),
    ("zero", "0"),
    ("minus zero is zero", "-0.0"),
    ("a fraction", "1.5"),
    ("a tenth", "0.1"),
    ("a negative fraction", "-2.25"),
    ("small, still written out", "0.000001"),
    ("smaller, written with an exponent", "1e-7"),
    ("smaller, with digits", "1.5e-7"),
    ("large, still written out", "123456789012345680000"),
    ("larger, written with an exponent", "1e21"),
    ("the largest whole number that is exact", "9007199254740991"),
    ("a time in milliseconds", "1771000000000"),
    ("a plain string", '"hello"'),
    ("quote and backslash are escaped", '"say \\"hi\\" \\\\ there"'),
    ("newline and tab use their short escapes", '"a\\nb\\tc"'),
    ("other control characters use four hex digits, lower case", '"\\u0001\\u001f"'),
    ("a slash is not escaped", '"a\\/b"'),
    ("characters beyond ASCII are written as they are", '"café ☕ 😀"'),
    ("an escaped character is written as itself", '"\\u00e9"'),
    ("line separator is written as it is", '"a\\u2028b"'),
    ("an empty string, and an empty key", '{"":""}'),
]

def make_canonical():
    out = []
    for name, text in CANONICAL:
        value = json.loads(text)
        c = canonical(value)
        out.append({"name": name, "json": text, "canonical": c, "sha256": sha(c)})
    write("canonical.json", out)

# ---------------------------------------------------------------- ulid.json

def make_ulids():
    cases = [
        (1469918176385, bytes(10)),
        (0, bytes([0xFF] * 10)),
        (0, bytes([0, 0, 0, 0, 0, 0, 0, 0, 0, 1])),
        (2 ** 48 - 1, bytes([0xFF] * 10)),
        (1771000000000, bytes(range(1, 11))),
    ]
    write("ulid.json", [{"timeMs": t, "randomHex": r.hex(), "ulid": ulid(t, r)} for t, r in cases])

# ---------------------------------------------------------------- a small log, from no product

def demo_log():
    t0 = 1771000000000
    rows = [
        ("demo.opened", {"title": "A record from no product"}, {"role": "host"}, 0, None),
        ("demo.joined", {"name": "Ada"}, {"role": "guest", "gid": "g_1"}, 1500, None),
        ("demo.note", {"text": "naïve café ☕", "n": 1}, {"role": "guest", "gid": "g_1", "via": "phone"}, 1500, None),
        ("device.button", {"dev": "biscuit-01", "press": "single"}, {"role": "device", "dev": "biscuit-01"}, 2200, None),
        ("demo.note", {"text": "made earlier, sent later", "n": 2, "tags": ["a", "b"]}, {"role": "guest", "gid": "g_1"}, 9000, t0 + 4000),
        ("demo.closed", {}, {"role": "host"}, 12000, None),
    ]
    events, prev = [], GENESIS
    for i, (type_, p, actor, dt, wt) in enumerate(rows):
        e = {
            "id": ulid(t0 + dt, bytes([i + 1] * 10)),
            "sid": "demo_0001", "seq": i + 1, "t": t0 + dt, "wt": wt,
            "actor": actor, "type": type_, "v": 1, "p": p, "prev": prev,
        }
        events.append(e)
        prev = hash_event(e)
    return events, prev

def write_log(name, events):
    with open(os.path.join(HERE, "logs", name), "w", encoding="utf-8") as f:
        for e in events:
            f.write(canonical(e) + "\n")

def rechain(events, start=0):
    """Recompute `prev` from `start` on, so only the fault we planted is wrong."""
    out = [dict(e) for e in events]
    prev = GENESIS if start == 0 else hash_event(out[start - 1])
    for i in range(start, len(out)):
        out[i]["prev"] = prev
        prev = hash_event(out[i])
    return out

def make_logs():
    events, head = demo_log()
    write_log("demo.jsonl", events)
    write("logs/demo.expected.json", {"count": len(events), "seq": len(events), "head": head})
    write("events.json", [{"name": f"{e['type']} at seq {e['seq']}", "event": e, "hash": hash_event(e)} for e in events])

    # The same small log, broken one way at a time. The first fault found is
    # the one reported, looking in this order: shape, record, seq, time, id, prev.
    def edit(i, **changes):
        out = [dict(e) for e in events]
        out[i].update(changes)
        return out
    def drop(i, key):
        out = [dict(e) for e in events]
        del out[i][key]
        return out
    faults = [
        ("an event is missing", "seq", 2, events[:2] + events[3:]),
        ("two events are swapped", "seq", 2, events[:2] + [events[3], events[2]] + events[4:]),
        ("the first event is not number 1", "seq", 0, events[1:]),
        ("a payload was edited afterwards", "prev", 3, edit(2, p={"text": "something else", "n": 1})),
        ("an event's prev was replaced", "prev", 4, edit(4, prev="e" * 64)),
        ("the first event does not start from zeros", "prev", 0, edit(0, prev="1" * 64)),
        ("the authority's time goes backwards", "time", 3, rechain(edit(3, t=events[2]["t"] - 1), 3)),
        ("an id is not after the one before", "id", 3, rechain(edit(3, id=events[1]["id"]), 3)),
        ("an event from another record", "record", 2, rechain(edit(2, sid="demo_0002"), 2)),
        ("a field is missing", "shape", 1, drop(1, "wt")),
        ("an unknown envelope version", "shape", 4, edit(4, v=2)),
        ("a field that is not in the envelope", "shape", 5, edit(5, extra=True)),
        ("an actor with no role", "shape", 1, edit(1, actor={"gid": "g_1"})),
        ("prev is not a hash", "shape", 2, edit(2, prev="not-a-hash")),
        ("the sequence number is not a whole number", "shape", 3, edit(3, seq=3.5)),
    ]
    write("chain-faults.json", [{"name": n, "code": c, "index": i, "log": log} for n, c, i, log in faults])

# ---------------------------------------------------------------- rules.json

def make_rules():
    press = {"type": "device.button", "p": {"dev": "biscuit-01", "press": "single"}}
    poll = {"type": "poll.resolved", "p": {"poll": "door", "winner": "left", "votes": 41, "tie": False, "note": None}}
    cases = [
        ("the type matches and there is no where", {"on": "device.button", "do": "show.primary"}, press, True),
        ("another type", {"on": "device.tapped", "do": "show.primary"}, press, False),
        ("a type is matched whole, not by its family", {"on": "device", "do": "x"}, press, False),
        ("every field in where is equal", {"on": "device.button", "where": {"dev": "biscuit-01", "press": "single"}, "do": "show.primary"}, press, True),
        ("one field differs", {"on": "device.button", "where": {"dev": "biscuit-01", "press": "double"}, "do": "show.secondary"}, press, False),
        ("a field the payload does not have", {"on": "device.button", "where": {"reader": "door"}, "do": "x"}, press, False),
        ("fields not named in where do not matter", {"on": "poll.resolved", "where": {"winner": "left"}, "do": "cue.play", "args": {"cue": "creaky-door"}}, poll, True),
        ("a number is matched as a number", {"on": "poll.resolved", "where": {"votes": 41}, "do": "x"}, poll, True),
        ("a number is not its text", {"on": "poll.resolved", "where": {"votes": "41"}, "do": "x"}, poll, False),
        ("false is matched", {"on": "poll.resolved", "where": {"tie": False}, "do": "x"}, poll, True),
        ("false is not null", {"on": "poll.resolved", "where": {"tie": None}, "do": "x"}, poll, False),
        ("null is matched when the field is there and null", {"on": "poll.resolved", "where": {"note": None}, "do": "x"}, poll, True),
        ("null does not match a field that is absent", {"on": "poll.resolved", "where": {"missing": None}, "do": "x"}, poll, False),
        ("an empty where matches", {"on": "poll.resolved", "where": {}, "do": "x"}, poll, True),
        ("a payload that is not an object matches no where", {"on": "x.happened", "where": {"a": 1}, "do": "x"}, {"type": "x.happened", "p": [1]}, False),
        ("where is matched on the payload, not the envelope", {"on": "device.button", "where": {"type": "device.button"}, "do": "x"}, press, False),
    ]
    invalid = [
        ("where may not hold an object", {"on": "a.b", "where": {"x": {"y": 1}}, "do": "x"}),
        ("where may not hold a list", {"on": "a.b", "where": {"x": [1]}, "do": "x"}),
        ("a rule needs a do", {"on": "a.b"}),
        ("a rule has four fields and no others", {"on": "a.b", "do": "x", "unless": {}}),
    ]
    write("rules.json", {
        "match": [{"name": n, "rule": r, "event": e, "match": m} for n, r, e, m in cases],
        "invalid": [{"name": n, "rule": r} for n, r in invalid],
        "maxDepth": 4,
    })

# ---------------------------------------------------------------- bridge.json and frames.json

def make_bridge():
    valid = [
        '{"k":"hello","dev":"jf-01","fw":"0.1.0","caps":["nfc","button","ring","espnow"]}',
        '{"k":"ev","n":41,"type":"device.tapped","p":{"reader":"door","tag":"04a2"}}',
        '{"k":"ev","n":42,"type":"device.button","p":{"dev":"biscuit-01","press":"single"}}',
        '{"k":"ev","n":43,"type":"device.near","p":{"dev":"biscuit-01","other":"biscuit-02"}}',
        '{"k":"do","cid":"c9","to":"biscuit-01","action":"device.haptic","args":{"pattern":"double"}}',
        '{"k":"do","cid":"c10","to":"jf-01","action":"device.ring"}',
        '{"k":"ack","cid":"c9","ok":true}',
        '{"k":"ack","cid":"c10","ok":false,"err":"busy"}',
    ]
    invalid = [
        ("not JSON", "hello"),
        ("an unknown kind", '{"k":"cmd","x":1}'),
        ("an event that is not a device event", '{"k":"ev","n":1,"type":"show.panic","p":{}}'),
        ("an event with no counter", '{"k":"ev","type":"device.button","p":{}}'),
        ("a counter of zero", '{"k":"ev","n":0,"type":"device.button","p":{}}'),
        ("an action a device does not have", '{"k":"do","cid":"c1","to":"jf-01","action":"show.panic"}'),
        ("an extra field", '{"k":"ack","cid":"c9","ok":true,"sig":"x"}'),
        ("a list, not an object", '[{"k":"ack","cid":"c9","ok":true}]'),
    ]
    counters = [
        {"last": 0, "n": 1, "fresh": True},
        {"last": 41, "n": 42, "fresh": True},
        {"last": 41, "n": 50, "fresh": True},
        {"last": 41, "n": 41, "fresh": False},
        {"last": 41, "n": 7, "fresh": False},
    ]
    write("bridge.json", {"valid": valid, "invalid": [{"name": n, "line": l} for n, l in invalid], "counters": counters})

def make_frames():
    valid = [
        '{"k":"hello","ticket":"eyJ.x.y","lastSeq":null}',
        '{"k":"hello","ticket":"eyJ.x.y","lastSeq":0}',
        '{"k":"hello","ticket":"eyJ.x.y","lastSeq":412}',
        '{"k":"act","cid":"c1","type":"poll.vote","p":{"poll":"door","option":"left"}}',
        '{"k":"act","cid":"c2","type":"anything.a.product.defines","p":null}',
        '{"k":"ping"}',
        '{"k":"pong"}',
    ]
    invalid = [
        ("not JSON", "{"),
        ("a frame only the authority sends", '{"k":"ack","cid":"c1","ok":true}'),
        ("hello with no ticket", '{"k":"hello","lastSeq":null}'),
        ("hello with no lastSeq", '{"k":"hello","ticket":"t"}'),
        ("a negative lastSeq", '{"k":"hello","ticket":"t","lastSeq":-1}'),
        ("an action with no cid", '{"k":"act","type":"x","p":{}}'),
        ("an extra field", '{"k":"ping","now":1}'),
    ]
    errors = ["bad_frame", "bad_action", "no_ticket", "expired", "forbidden", "state", "conflict", "not_found", "rate", "internal"]
    write("frames.json", {"client": {"valid": valid, "invalid": [{"name": n, "frame": f} for n, f in invalid]}, "refusals": errors})

if __name__ == "__main__":
    make_canonical()
    make_ulids()
    make_logs()
    make_rules()
    make_bridge()
    make_frames()
    print("vectors written")
