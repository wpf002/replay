export type Keyword = "stop" | "start" | "help";

// Carrier-standard keywords. Twilio matches the whole message body, case-insensitively, and so do
// we. YES is deliberately not an opt-in keyword here because it confirms actions; remove it from
// the Messaging Service's Advanced Opt-Out opt-in list too.
const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"]);
const START = new Set(["START", "UNSTOP"]);
const HELP = new Set(["HELP", "INFO"]);

export function classifyKeyword(body: string): Keyword | null {
  const word = body.trim().toUpperCase();
  if (STOP.has(word)) return "stop";
  if (START.has(word)) return "start";
  if (HELP.has(word)) return "help";
  return null;
}

export function helpText(supportEmail: string | undefined): string {
  const contact = supportEmail ? ` Help: ${supportEmail}.` : "";
  return `Relay: your AI assistant by text and call.${contact} Msg frequency varies. Msg & data rates may apply. Reply STOP to cancel.`;
}

export function unknownNumberText(webUrl: string): string {
  return `Relay: this number isn't signed up yet. Request an invite at ${webUrl}. Reply STOP to opt out.`;
}
