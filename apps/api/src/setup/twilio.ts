import twilio from "twilio";

export type TwilioClient = ReturnType<typeof twilio>;

const NAME = "Relay";

export function twilioFor(accountSid: string, authToken: string): TwilioClient {
  return twilio(accountSid, authToken);
}

export async function describeAccount(
  client: TwilioClient,
  accountSid: string,
): Promise<{ name: string; trial: boolean; active: boolean }> {
  const account = await client.api.v2010.accounts(accountSid).fetch();
  return { name: account.friendlyName, trial: account.type === "Trial", active: account.status === "active" };
}

export interface OwnedNumber {
  sid: string;
  phoneNumber: string;
  sms: boolean;
  voice: boolean;
}

export async function ownedNumbers(client: TwilioClient): Promise<OwnedNumber[]> {
  const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
  return numbers.map((n) => ({
    sid: n.sid,
    phoneNumber: n.phoneNumber,
    sms: Boolean(n.capabilities?.sms),
    voice: Boolean(n.capabilities?.voice),
  }));
}

export async function searchNumbers(client: TwilioClient, areaCode?: number): Promise<string[]> {
  const found = await client.availablePhoneNumbers("US").local.list({
    smsEnabled: true,
    voiceEnabled: true,
    limit: 5,
    ...(areaCode ? { areaCode } : {}),
  });
  return found.map((n) => n.phoneNumber);
}

/** Monthly price of a US local number, when Twilio's pricing API answers. */
export async function localNumberPrice(client: TwilioClient): Promise<number | null> {
  try {
    const country = await client.pricing.v1.phoneNumbers.countries("US").fetch();
    const local = country.phoneNumberPrices.find((p) => p.numberType === "local");
    // Typed as number, but the API sends strings like "1.15".
    const price = Number(local?.currentPrice ?? local?.basePrice);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export async function buyNumber(client: TwilioClient, phoneNumber: string): Promise<OwnedNumber> {
  const n = await client.incomingPhoneNumbers.create({ phoneNumber, friendlyName: NAME });
  return { sid: n.sid, phoneNumber: n.phoneNumber, sms: true, voice: true };
}

/** Reuses the Verify service named "Relay" or creates it. */
export async function ensureVerifyService(client: TwilioClient): Promise<{ sid: string; created: boolean }> {
  const existing = (await client.verify.v2.services.list({ limit: 50 })).find((s) => s.friendlyName === NAME);
  if (existing) return { sid: existing.sid, created: false };
  const service = await client.verify.v2.services.create({ friendlyName: NAME, codeLength: 6 });
  return { sid: service.sid, created: true };
}

/** Reuses the Messaging Service named "Relay" or creates it, and puts the number in its sender pool. */
export async function ensureMessagingService(
  client: TwilioClient,
  numberSid: string,
): Promise<{ sid: string; created: boolean }> {
  let created = false;
  let service = (await client.messaging.v1.services.list({ limit: 50 })).find((s) => s.friendlyName === NAME);
  if (!service) {
    service = await client.messaging.v1.services.create({ friendlyName: NAME, useInboundWebhookOnNumber: false });
    created = true;
  }
  const pool = await client.messaging.v1.services(service.sid).phoneNumbers.list({ limit: 50 });
  if (!pool.some((p) => p.sid === numberSid)) {
    await client.messaging.v1.services(service.sid).phoneNumbers.create({ phoneNumberSid: numberSid });
  }
  return { sid: service.sid, created };
}

export interface WebhookState {
  sms: string | null;
  voice: string | null;
}

/** Points inbound texts (Messaging Service) and calls (the number) at this API. */
export async function syncWebhooks(
  client: TwilioClient,
  opts: { numberSid: string; messagingServiceSid: string; publicUrl: string },
): Promise<{ sms: string; voice: string }> {
  const base = opts.publicUrl.replace(/\/+$/, "");
  const sms = `${base}/twilio/sms`;
  const voice = `${base}/twilio/voice`;
  await client.messaging.v1.services(opts.messagingServiceSid).update({
    inboundRequestUrl: sms,
    inboundMethod: "POST",
    useInboundWebhookOnNumber: false,
  });
  await client.incomingPhoneNumbers(opts.numberSid).update({
    smsUrl: sms,
    smsMethod: "POST",
    voiceUrl: voice,
    voiceMethod: "POST",
  });
  return { sms, voice };
}

export async function readWebhooks(
  client: TwilioClient,
  opts: { numberSid: string; messagingServiceSid?: string },
): Promise<WebhookState> {
  const number = await client.incomingPhoneNumbers(opts.numberSid).fetch();
  const service = opts.messagingServiceSid
    ? await client.messaging.v1.services(opts.messagingServiceSid).fetch()
    : null;
  return { sms: service?.inboundRequestUrl ?? number.smsUrl ?? null, voice: number.voiceUrl ?? null };
}

export async function numberSid(client: TwilioClient, phoneNumber: string): Promise<string | null> {
  const [n] = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  return n?.sid ?? null;
}
