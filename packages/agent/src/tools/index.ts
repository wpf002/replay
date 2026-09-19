import type { AnyTool } from "./types.js";
import { webSearch } from "./web.js";

export * from "./types.js";
export { webSearch };

const ALL: AnyTool[] = [webSearch];

/** Tools available for this person on this channel. */
export function toolsFor(opts: { channel: "sms" | "voice"; hasGoogle: boolean }): AnyTool[] {
  return ALL.filter(
    (t) => (!t.needsGoogle || opts.hasGoogle) && (opts.channel === "sms" || !t.smsOnly),
  );
}

export function findTool(name: string): AnyTool | undefined {
  return ALL.find((t) => t.name === name);
}
