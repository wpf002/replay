import { env, need } from "./env.js";
import { publicApiUrl, twilioClient, twiml } from "./twilio.js";

/** wss:// URL Twilio connects to. Twilio signs the upgrade request with this exact URL. */
export function relayUrl(): string {
  return publicApiUrl("/voice/ws").replace(/^http/, "ws");
}

/** TwiML that hands the call to ConversationRelay, which connects back to /voice/ws. */
export function conversationRelayTwiml(opts: {
  greeting?: string;
  parameters: Record<string, string>;
}): string {
  const e = env();
  const res = new (twiml().VoiceResponse)();
  const connect = res.connect({ action: publicApiUrl("/twilio/voice/done") });
  const relay = connect.conversationRelay({
    url: relayUrl(),
    ...(opts.greeting ? { welcomeGreeting: opts.greeting, welcomeGreetingInterruptible: "any" } : {}),
    interruptible: "any",
    dtmfDetection: true,
    language: "en-US",
    hints: "Relay, Claude, GPT, ChatGPT, Perplexity",
    ...(e.VOICE_TTS_PROVIDER ? { ttsProvider: e.VOICE_TTS_PROVIDER } : {}),
    ...(e.VOICE_NAME ? { voice: e.VOICE_NAME } : {}),
  });
  for (const [name, value] of Object.entries(opts.parameters)) relay.parameter({ name, value });
  return res.toString();
}

/** Places an outbound call from the Relay number that connects to ConversationRelay on answer. */
export async function placeRelayCall(to: string, parameters: Record<string, string>): Promise<string> {
  const call = await twilioClient().calls.create({
    to,
    from: need("TWILIO_PHONE_NUMBER"),
    twiml: conversationRelayTwiml({ parameters }),
    timeout: 30,
    statusCallback: publicApiUrl("/twilio/call-status"),
    statusCallbackEvent: ["completed"],
  });
  return call.sid;
}
