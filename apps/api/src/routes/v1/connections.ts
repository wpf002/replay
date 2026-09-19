import { disconnectGoogle, GOOGLE_SCOPES, googleConsentUrl } from "@relay/core";
import { getPrisma } from "@relay/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { signOAuthState } from "../../auth/tokens.js";
import { currentUser, requireUser } from "../../plugins/auth.js";

export async function connectionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get("/connections", async (req) => {
    const google = await getPrisma().connection.findUnique({
      where: { userId_provider: { userId: currentUser(req).id, provider: "GOOGLE" } },
      select: { accountEmail: true, scopes: true, createdAt: true },
    });
    return {
      google: google
        ? {
            connected: true,
            email: google.accountEmail,
            gmail: google.scopes.includes(GOOGLE_SCOPES.gmailRead) && google.scopes.includes(GOOGLE_SCOPES.gmailSend),
            calendar: google.scopes.includes(GOOGLE_SCOPES.calendar),
            connectedAt: google.createdAt.toISOString(),
          }
        : { connected: false, email: null, gmail: false, calendar: false, connectedAt: null },
    };
  });

  /** Returns Google's consent URL. The app opens it in an auth session; the web redirects to it. */
  app.post("/connections/google", async (req) => {
    const { returnTo } = z.object({ returnTo: z.enum(["app", "web"]).default("app") }).parse(req.body ?? {});
    const state = await signOAuthState(currentUser(req).id, returnTo);
    return { url: googleConsentUrl(state) };
  });

  app.delete("/connections/google", async (req) => {
    await disconnectGoogle(currentUser(req).id);
    return { ok: true };
  });
}
