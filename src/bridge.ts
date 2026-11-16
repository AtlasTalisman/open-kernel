import { z } from "zod";
import { parseJson } from "./frames";

// The device bridge (contract §7): one JSON object a line, the same over
// USB serial, a WebSocket or Bluetooth through a phone. A device says what
// happened; a host asks it to do things.
//
// How a message is signed on a small device is not settled, and is not here.

const Id = z.string().min(1).max(64);

/** The events a device may report, and nothing else. */
export const DEVICE_EVENT_TYPES = ["device.registered", "device.tapped", "device.button", "device.gesture", "device.near", "device.lost"] as const;
export const DeviceEventType = z.enum(DEVICE_EVENT_TYPES);
export type DeviceEventType = z.infer<typeof DeviceEventType>;

/** What a host may ask of a device. */
export const DEVICE_ACTIONS = ["device.ring", "device.haptic", "device.sound"] as const;
export const DeviceAction = z.enum(DEVICE_ACTIONS);
export type DeviceAction = z.infer<typeof DeviceAction>;

/** Who I am, what firmware I run, what I can sense and do. */
export const BridgeHello = z.strictObject({ k: z.literal("hello"), dev: Id, fw: z.string().min(1).max(32), caps: z.array(z.string().min(1).max(32)).max(64) });
/** Something happened. `n` only ever goes up, so a recorded message cannot be played again. */
export const BridgeEvent = z.strictObject({ k: z.literal("ev"), n: z.number().int().positive(), type: DeviceEventType, p: z.record(z.string(), z.unknown()) });
/** Please do this. `cid` is echoed in the answer. */
export const BridgeDo = z.strictObject({ k: z.literal("do"), cid: Id, to: Id, action: DeviceAction, args: z.record(z.string(), z.unknown()).optional() });
export const BridgeAck = z.strictObject({ k: z.literal("ack"), cid: Id, ok: z.boolean(), err: z.string().max(64).optional() });

export const BridgeMessage = z.discriminatedUnion("k", [BridgeHello, BridgeEvent, BridgeDo, BridgeAck]);
export type BridgeMessage = z.infer<typeof BridgeMessage>;
export type BridgeEvent = z.infer<typeof BridgeEvent>;

/** Parse one line from the bridge. Returns null if it is not a bridge message. */
export function parseBridgeLine(line: string): BridgeMessage | null {
  const parsed = BridgeMessage.safeParse(parseJson(line));
  return parsed.success ? parsed.data : null;
}

/**
 * Is this the next thing a device said? A counter that does not go up is a
 * repeat or a replay, and is dropped. A gap is allowed: a message was lost
 * on the way, and the device does not wait for it.
 */
export function freshCount(last: number, n: number): boolean {
  return Number.isInteger(n) && n > last;
}
