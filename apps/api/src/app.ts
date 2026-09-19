import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import sensible from "@fastify/sensible";
import websocket from "@fastify/websocket";
import { env, logOptions, NotConfiguredError, UserError } from "@relay/core";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { healthRoutes } from "./routes/health.js";
import { oauthGoogleRoutes } from "./routes/oauth-google.js";
import { twilioSmsRoutes } from "./routes/twilio-sms.js";
import { twilioVoiceRoutes } from "./routes/twilio-voice.js";
import { actionRoutes } from "./routes/v1/actions.js";
import { aiAccountRoutes } from "./routes/v1/ai-accounts.js";
import { authRoutes } from "./routes/v1/auth.js";
import { billingRoutes } from "./routes/v1/billing.js";
import { connectionRoutes } from "./routes/v1/connections.js";
import { historyRoutes } from "./routes/v1/history.js";
import { meRoutes } from "./routes/v1/me.js";
import { waitlistRoutes } from "./routes/waitlist.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: logOptions, trustProxy: true });

  await app.register(sensible);
  await app.register(formbody);
  await app.register(websocket);
  await app.register(cors, { origin: [env().PUBLIC_WEB_URL] });
  app.decorateRequest("user", null);

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof NotConfiguredError) {
      return reply.code(501).send({ error: err.message });
    }
    if (err instanceof UserError) {
      return reply.code(err.status).send({ error: err.message, ...(err.reason ? { reason: err.reason } : {}) });
    }
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return reply.code(400).send({
        error: first?.message ?? "Invalid request",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "Something went wrong" });
  });

  await app.register(healthRoutes);
  await app.register(twilioSmsRoutes);
  await app.register(twilioVoiceRoutes);
  await app.register(oauthGoogleRoutes);
  await app.register(
    async (v1) => {
      await v1.register(waitlistRoutes);
      await v1.register(authRoutes);
      await v1.register(meRoutes);
      await v1.register(connectionRoutes);
      await v1.register(aiAccountRoutes);
      await v1.register(actionRoutes);
      await v1.register(historyRoutes);
      await v1.register(billingRoutes);
    },
    { prefix: "/v1" },
  );

  return app;
}
