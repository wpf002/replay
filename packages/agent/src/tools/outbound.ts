import { z } from "zod";
import { defineTool, type AnyTool } from "./types.js";

// Tools for the agent while it's on a call with a business. They act on the call itself.

export const pressKeys = defineTool({
  name: "press_keys",
  description: 'Press keys on the phone keypad to get through an automated menu, e.g. "2" or "0#".',
  input: z.object({ digits: z.string().regex(/^[0-9*#w]{1,20}$/) }),
  kind: "read",
  describe: ({ digits }) => `Press ${digits}`,
  async run({ digits }) {
    return { content: `Pressed ${digits}.`, data: { digits } };
  },
});

export const CALL_OUTCOMES = ["booked", "done", "declined", "no_answer", "needs_you"] as const;

export const finishCall = defineTool({
  name: "finish_call",
  description:
    "End the call once you've said goodbye, and report the result to your client. Call it as soon as the goal is done, declined, or can't be done on this call.",
  input: z.object({
    outcome: z.enum(CALL_OUTCOMES).describe(
      "booked = reservation or appointment made; done = question answered or task finished; declined = they said no; no_answer = voicemail, a closed message, or no person; needs_you = they need something only the client can decide",
    ),
    summary: z
      .string()
      .trim()
      .min(5)
      .max(400)
      .describe("One or two sentences for your client with every confirmed detail: time, date, name, confirmation number, or what they need."),
  }),
  kind: "read",
  describe: ({ summary }) => `Finish the call: ${summary}`,
  async run({ outcome, summary }) {
    return { content: "Call ending.", data: { finish: { outcome, summary } } };
  },
});

export const outboundCallTools: AnyTool[] = [pressKeys, finishCall];
