import { env, formatPhone, placeRelayCall, rateLimit, toE164, UserError, zonedParts } from "@relay/core";
import { getPrisma } from "@relay/db";
import type { ModelId } from "@relay/types";
import { z } from "zod";
import { defineTool, type ToolContext } from "./types.js";

const CALLS_PER_DAY = 5;
/** Local hours (in the person's time zone) when Relay will place calls to businesses. */
const CALL_HOURS = { from: 8, to: 21 };

/** Only US and Canadian business numbers; never premium, the user's own number, or Relay's. */
/**
 * The model that talks to a business on a call Relay places: the person's default when it can use
 * tools, otherwise Claude, then ChatGPT, whichever they have access to.
 */
export function callModel(
  keyFor: ToolContext["keyFor"],
  preferred?: ModelId,
): { provider: "claude" | "gpt"; key: { apiKey?: string } } | null {
  const order = preferred === "gpt" ? (["gpt", "claude"] as const) : (["claude", "gpt"] as const);
  for (const provider of order) {
    const key = keyFor(provider);
    if (key) return { provider, key };
  }
  return null;
}

export function checkCallTarget(phone: string, userPhone: string): string {
  const e164 = toE164(phone);
  if (!e164 || !e164.startsWith("+1")) throw new UserError("Relay can only call US and Canadian numbers.");
  if (/^\+1(900|976)/.test(e164)) throw new UserError("Relay doesn't call premium-rate numbers.");
  if (e164 === userPhone) throw new UserError("That's your own number.");
  if (e164 === env().TWILIO_PHONE_NUMBER) throw new UserError("That's Relay's own number.");
  return e164;
}

export const placeCall = defineTool({
  name: "place_call",
  description:
    "Phone a business on the person's behalf, for example to book a restaurant table or ask a question, then text them the outcome. Relay says it's an automated assistant. Only for businesses, never for calling private individuals. Give the exact goal and the limits you're allowed to accept (time windows, party size).",
  input: z.object({
    businessName: z.string().trim().min(1).max(120),
    phoneNumber: z
      .string()
      .trim()
      .min(7)
      .max(24)
      .refine((p) => {
        const e164 = toE164(p);
        return Boolean(e164?.startsWith("+1")) && !/^\+1(900|976)/.test(e164 ?? "");
      }, "Relay can only call US and Canadian business numbers."),
    goal: z
      .string()
      .trim()
      .min(5)
      .max(400)
      .describe('What to accomplish, e.g. "Book a table for 2 this Friday at 7 PM"'),
    flexibility: z
      .string()
      .trim()
      .max(300)
      .optional()
      .describe('What else is acceptable, e.g. "any time between 6:30 and 8 PM"'),
    nameForBooking: z.string().trim().max(80).optional(),
    shareCallbackNumber: z
      .boolean()
      .default(true)
      .describe("Whether Relay may give the person's phone number to the business"),
  }),
  kind: "external",
  risk: () => "HIGH",
  describe: (c, ctx) => {
    const lines = [
      `Call ${c.businessName} at ${formatPhone(toE164(c.phoneNumber) ?? c.phoneNumber)} to: ${c.goal}`,
    ];
    if (c.flexibility) lines.push(`OK to accept: ${c.flexibility}`);
    if (c.nameForBooking) lines.push(`Name: ${c.nameForBooking}`);
    lines.push(
      c.shareCallbackNumber
        ? `Shares your number ${formatPhone(ctx.phone)} with them`
        : "Doesn't share your number",
    );
    return lines.join("\n");
  },
  async run(c, ctx) {
    const to = checkCallTarget(c.phoneNumber, ctx.phone);
    const hour = zonedParts(new Date(), ctx.timezone).hour;
    if (hour < CALL_HOURS.from || hour >= CALL_HOURS.to) {
      throw new UserError("It's outside business calling hours (8 AM to 9 PM your time). Ask me again then.");
    }
    const limit = await rateLimit(`outbound-calls:${ctx.userId}`, CALLS_PER_DAY, 24 * 60 * 60);
    if (!limit.allowed) throw new UserError(`Relay places up to ${CALLS_PER_DAY} calls a day.`);

    if (!ctx.actionId) throw new Error("place_call only runs as an approved action");
    if (!callModel(ctx.keyFor)) {
      throw new UserError("Relay needs Claude or ChatGPT to make calls. Connect one in the Relay app under AI accounts.");
    }
    const prisma = getPrisma();
    const conversation = await prisma.conversation.create({
      data: { userId: ctx.userId, channel: "VOICE", direction: "OUTBOUND", actionId: ctx.actionId },
    });
    const callSid = await placeRelayCall(to, { mode: "outbound", conversationId: conversation.id });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { callSid } });

    return {
      content: `Calling ${c.businessName}.`,
      receipt: `Calling ${c.businessName} now. I'll text you how it goes.`,
      data: { inProgress: true, callSid, conversationId: conversation.id },
    };
  },
});
