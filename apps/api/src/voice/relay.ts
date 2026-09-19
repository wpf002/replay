import type { WebSocket } from "ws";
import { z } from "zod";

// Twilio ConversationRelay WebSocket protocol. Twilio does speech-to-text and text-to-speech;
// we receive transcribed prompts and stream back text to speak.

export const inboundMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setup"),
    sessionId: z.string().optional(),
    callSid: z.string(),
    from: z.string().optional(),
    to: z.string().optional(),
    direction: z.string().optional(),
    customParameters: z.record(z.string(), z.string()).optional(),
  }),
  z.object({ type: z.literal("prompt"), voicePrompt: z.string(), last: z.boolean().optional() }),
  z.object({ type: z.literal("dtmf"), digit: z.string() }),
  z.object({
    type: z.literal("interrupt"),
    utteranceUntilInterrupt: z.string().optional(),
    durationUntilInterruptMs: z.number().optional(),
  }),
  z.object({ type: z.literal("error"), description: z.string().optional() }),
]);

export type InboundMessage = z.infer<typeof inboundMessage>;
export type SetupMessage = Extract<InboundMessage, { type: "setup" }>;

export function parseRelayMessage(raw: string): InboundMessage | null {
  try {
    const parsed = inboundMessage.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Thin sender over the socket. Every method is a no-op once the socket closes. */
export class RelaySocket {
  constructor(private readonly ws: WebSocket) {}

  get open(): boolean {
    return this.ws.readyState === this.ws.OPEN;
  }

  private send(payload: Record<string, unknown>): void {
    if (this.open) this.ws.send(JSON.stringify(payload));
  }

  /** Streams speech. `last` marks the end of this response. */
  text(token: string, last = false): void {
    this.send({ type: "text", token, last });
  }

  /** Speaks a complete line. */
  say(line: string): void {
    this.text(line, true);
  }

  /** Presses keys on the far end (menu navigation on outbound calls). */
  sendDigits(digits: string): void {
    this.send({ type: "sendDigits", digits });
  }

  end(handoffData?: Record<string, unknown>): void {
    this.send({ type: "end", ...(handoffData ? { handoffData: JSON.stringify(handoffData) } : {}) });
  }
}

const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  won: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
};

/** "It's one two 3 4" -> "1234". Only used while Relay is waiting for a PIN. */
export function spokenDigits(text: string): string {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => (/^\d+$/.test(w) ? w : (DIGIT_WORDS[w] ?? "")))
    .join("");
}

export function isCancel(text: string): boolean {
  return /\b(no|nope|cancel|never ?mind|stop|don'?t|skip)\b/i.test(text);
}
