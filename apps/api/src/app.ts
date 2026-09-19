import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import sensible from "@fastify/sensible";
import { env, logOptions, NotConfiguredError, UserError } from "@relay/core";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { healthRoutes } from "./routes/health.js";
import { twilioSmsRoutes } from "./routes/twilio-sms.js";
import { waitlistRoutes } from "./routes/waitlist.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: logOptions, trustProxy: true });

  await app.register(sensible);
  await app.register(formbody);
  await app.register(cors, { origin: [env().PUBLIC_WEB_URL] });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof NotConfiguredError) {
      return reply.code(501).send({ error: err.message });
    }
    if (err instanceof UserError) {
      return reply.code(err.status).send({ error: err.message });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "Invalid request",
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
  await app.register(waitlistRoutes, { prefix: "/v1" });

  return app;
}
