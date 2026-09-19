import twilio from "twilio";
import { env, need } from "./env.js";

let client: twilio.Twilio | undefined;

export function twilioClient(): twilio.Twilio {
  client ??= twilio(need("TWILIO_ACCOUNT_SID"), need("TWILIO_AUTH_TOKEN"));
  return client;
}

/** Sends through the 10DLC Messaging Service when configured, else from the Relay number. */
export async function sendSms(to: string, body: string): Promise<string> {
  const serviceSid = env().TWILIO_MESSAGING_SERVICE_SID;
  const message = await twilioClient().messages.create({
    to,
    body,
    ...(serviceSid ? { messagingServiceSid: serviceSid } : { from: need("TWILIO_PHONE_NUMBER") }),
  });
  return message.sid;
}

/** Twilio error codes that mean retrying the same send won't help. */
export const PERMANENT_SMS_ERRORS = new Set([
  21211, // invalid To number
  21408, // region not enabled
  21610, // recipient replied STOP
  21612, // not reachable from this number
  21614, // not a mobile number
]);

export function twilioErrorCode(err: unknown): number | undefined {
  const code = (err as { code?: unknown })?.code;
  return typeof code === "number" ? code : undefined;
}

/**
 * Validates X-Twilio-Signature. `url` must be the exact public URL Twilio called, including the
 * query string, and `params` the parsed form body (empty for WebSocket upgrades).
 */
export function validTwilioSignature(
  signature: string | undefined,
  url: string,
  params: Record<string, unknown>,
): boolean {
  if (!signature) return false;
  return twilio.validateRequest(need("TWILIO_AUTH_TOKEN"), signature, url, params);
}

/** Absolute public URL for an API path, e.g. publicApiUrl("/twilio/sms"). */
export function publicApiUrl(path: string): string {
  return need("PUBLIC_API_URL").replace(/\/+$/, "") + path;
}

export function twiml(): typeof twilio.twiml {
  return twilio.twiml;
}

export async function startPhoneVerification(phone: string): Promise<void> {
  await twilioClient().verify.v2.services(need("TWILIO_VERIFY_SERVICE_SID")).verifications.create({
    to: phone,
    channel: "sms",
  });
}

export async function checkPhoneVerification(phone: string, code: string): Promise<boolean> {
  const check = await twilioClient()
    .verify.v2.services(need("TWILIO_VERIFY_SERVICE_SID"))
    .verificationChecks.create({ to: phone, code });
  return check.status === "approved";
}
