import { publicApiUrl, validTwilioSignature } from "@relay/core";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * preHandler for every Twilio webhook. The signature covers the exact public URL Twilio called
 * plus the form params, so the URL is rebuilt from PUBLIC_API_URL rather than the Host header.
 */
export async function verifyTwilio(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const signature = req.headers["x-twilio-signature"];
  const url = publicApiUrl(req.url);
  const params = (req.body ?? {}) as Record<string, unknown>;
  if (typeof signature !== "string" || !validTwilioSignature(signature, url, params)) {
    req.log.warn({ url }, "rejected Twilio request with a missing or invalid signature");
    await reply.code(403).send({ error: "Invalid Twilio signature" });
  }
}

export function sendTwiml(reply: FastifyReply, xml: string): FastifyReply {
  return reply.type("text/xml").send(xml);
}
