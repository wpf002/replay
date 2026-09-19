import { redis } from "@relay/core";
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
    });
  });
}
