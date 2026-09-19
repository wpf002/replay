import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));

// TODO: POST /twilio/sms       (validate signature, STOP/HELP, enqueue turn)
// TODO: POST /twilio/voice     (TwiML <Connect><ConversationRelay url=".../voice/ws"/>)
// TODO: GET  /voice/ws         (ConversationRelay WebSocket)
// TODO: GET  /oauth/google/*   (connect Gmail + Calendar)
// TODO: /v1/*                  (mobile API: auth, settings, history, approvals)

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
