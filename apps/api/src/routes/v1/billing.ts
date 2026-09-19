import type { FastifyInstance } from "fastify";
import { requireUser } from "../../plugins/auth.js";

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  // Relay is free during the invite-only beta. Daily model spend is capped per user instead.
  app.get("/billing", async (_req, reply) =>
    reply.code(501).send({
      error:
        "TODO: billing isn't built. Needs a pricing decision plus Stripe (STRIPE_SECRET_KEY, price IDs, webhook secret).",
    }),
  );
}
