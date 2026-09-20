import twilio from "twilio";

const url = `${process.env.PUBLIC_API_URL}/twilio/sms`;
const params: Record<string, string> = {
  From: process.argv[2] ?? "+15125550142",
  To: process.env.TWILIO_PHONE_NUMBER ?? "+15555550100",
  Body: process.argv[3] ?? "hi",
  MessageSid: `SM${Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32)}`,
  AccountSid: process.env.TWILIO_ACCOUNT_SID ?? "AC00000000000000000000000000000000",
  NumMedia: "0",
};
const signature = twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, url, params);
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature },
  body: new URLSearchParams(params).toString(),
});
console.log("webhook", res.status, (await res.text()).slice(0, 200));
