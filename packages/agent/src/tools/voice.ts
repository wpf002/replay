import { addMessage, currentSmsConversation, enqueueTurn, textUser } from "@relay/core";
import { getPrisma } from "@relay/db";
import { z } from "zod";
import { defineTool } from "./types.js";

// These only exist on calls. They text the caller's own number, never anyone else, so they don't
// need approval: a spoofed caller ID can't redirect what they send.

export const textMe = defineTool({
  name: "text_me",
  description:
    "Text the caller something that's easier to read than hear: an address, a link, a list, a draft. Goes only to their own number.",
  input: z.object({ message: z.string().trim().min(1).max(1200) }),
  kind: "read",
  voiceOnly: true,
  describe: ({ message }) => `Text you: "${message}"`,
  async run({ message }, ctx) {
    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const { sent } = await textUser({ user, body: message, metadata: { kind: "from-call" } });
    return { content: sent ? "Texted." : "The text couldn't be delivered." };
  },
});

export const followUpByText = defineTool({
  name: "follow_up_by_text",
  description:
    "Hand a request to Relay's text channel and hang up free. Use for research or anything that takes more than a few seconds, and for email or calendar questions when those tools aren't available on this call. The answer arrives as a text.",
  input: z.object({
    request: z.string().trim().min(3).max(600).describe("The request, written as the caller would text it"),
  }),
  kind: "read",
  voiceOnly: true,
  describe: ({ request }) => `Follow up by text: "${request}"`,
  async run({ request }, ctx) {
    const conversation = await currentSmsConversation(ctx.userId);
    const message = await addMessage({
      conversationId: conversation.id,
      direction: "INBOUND",
      role: "USER",
      content: request,
      metadata: { kind: "from-call" },
    });
    await enqueueTurn({ userId: ctx.userId, messageId: message.id }, `call-${message.id}`, 0);
    return { content: "Queued. The answer will arrive by text." };
  },
});

export const endCall = defineTool({
  name: "end_call",
  description: "Hang up after you've said goodbye.",
  input: z.object({}),
  kind: "read",
  voiceOnly: true,
  describe: () => "End the call",
  async run() {
    return { content: "Ending the call.", data: { endCall: true } };
  },
});
