import { rateLimit, UserError } from "@relay/core";
import { getPrisma } from "@relay/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const body = z.object({
  email: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    z.email().max(254),
  ),
  source: z.string().trim().max(64).optional(),
});

export async function waitlistRoutes(app: FastifyInstance): Promise<void> {
  app.post("/waitlist", async (req) => {
    const limit = await rateLimit(`waitlist:${req.ip}`, 10, 60 * 60);
    if (!limit.allowed) throw new UserError("Too many sign-ups from this address. Try again later.", 429);

    const { email, source } = body.parse(req.body);
    await getPrisma().waitlistEntry.upsert({
      where: { email },
      create: { email, source: source ?? null },
      update: {},
    });
    return { ok: true };
  });
}
