import { getPrisma, type User } from "@relay/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import { verifySession } from "../auth/tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

/** preHandler for /v1 routes that need a signed-in user. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    await reply.code(401).send({ error: "Sign in to continue" });
    return;
  }
  try {
    const { userId, version } = await verifySession(token);
    const user = await getPrisma().user.findUnique({ where: { id: userId } });
    if (!user || user.tokenVersion !== version) throw new Error("stale session");
    req.user = user;
  } catch {
    await reply.code(401).send({ error: "Your session expired. Sign in again." });
  }
}

/** The signed-in user. Only call behind requireUser. */
export function currentUser(req: FastifyRequest): User {
  if (!req.user) throw new Error("currentUser called without requireUser");
  return req.user;
}
