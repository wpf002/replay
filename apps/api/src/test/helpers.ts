import { redis } from "@relay/core";
import { getPrisma, type User } from "@relay/db";
import twilio from "twilio";

export const hasDb = Boolean(process.env.DATABASE_URL);

/** Form-encoded webhook request signed the way Twilio signs it. */
export function signedTwilioRequest(path: string, params: Record<string, string>) {
  const url = `${process.env.PUBLIC_API_URL}${path}`;
  const signature = twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, url, params);
  return {
    method: "POST" as const,
    url: path,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    payload: new URLSearchParams(params).toString(),
  };
}

export async function resetState(): Promise<void> {
  await getPrisma().$executeRawUnsafe(
    'TRUNCATE "User", "Invite", "WaitlistEntry" RESTART IDENTITY CASCADE',
  );
  await redis().flushdb();
}

let phoneSeq = 100;
export async function makeUser(data: Partial<User> = {}): Promise<User> {
  phoneSeq += 1;
  return getPrisma().user.create({
    data: {
      phone: `+1512555${String(phoneSeq).padStart(4, "0")}`,
      name: "Test User",
      smsOptInAt: new Date(),
      ...data,
    },
  });
}
