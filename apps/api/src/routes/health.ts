import { env, redis } from "@relay/core";
import { getPrisma } from "@relay/db";
import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_req, reply) => {
    const [db, cache] = await Promise.allSettled([
      getPrisma().$queryRaw`SELECT 1`,
      redis().ping(),
    ]);
    const ok = db.status === "fulfilled" && cache.status === "fulfilled";
    return reply.code(ok ? 200 : 503).send({
      ok,
      db: db.status === "fulfilled",
      redis: cache.status === "fulfilled",
      // Where Twilio should be pointing, so nothing opens a second tunnel to the same server.
      publicUrl: env().PUBLIC_API_URL ?? null,
    });
  });
}
