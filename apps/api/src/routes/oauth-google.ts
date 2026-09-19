import { completeGoogleConnect, env } from "@relay/core";
import { APP_SCHEME } from "@relay/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyOAuthState, type OAuthReturn } from "../auth/tokens.js";

type Outcome = "connected" | "denied" | "error";

function destination(returnTo: OAuthReturn, outcome: Outcome): string {
  if (returnTo === "web") {
    const url = new URL("/account", env().PUBLIC_WEB_URL);
    url.searchParams.set("google", outcome);
    return url.toString();
  }
  return `${APP_SCHEME}://connections?google=${outcome}`;
}

export async function oauthGoogleRoutes(app: FastifyInstance): Promise<void> {
  app.get("/oauth/google/callback", async (req, reply) => {
    const query = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .parse(req.query);

    let target: { userId: string; returnTo: OAuthReturn };
    try {
      target = await verifyOAuthState(query.state ?? "");
    } catch {
      return reply.code(400).type("text/plain").send("This link expired. Start connecting Google again from Relay.");
    }

    if (query.error || !query.code) {
      return reply.redirect(destination(target.returnTo, "denied"));
    }
    try {
      await completeGoogleConnect(target.userId, query.code);
      return reply.redirect(destination(target.returnTo, "connected"));
    } catch (err) {
      req.log.error({ err, userId: target.userId }, "Google connect failed");
      return reply.redirect(destination(target.returnTo, "error"));
    }
  });
}
