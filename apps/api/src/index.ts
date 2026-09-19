import { closeRedis } from "@relay/core";
import { getPrisma } from "@relay/db";
import { buildApp } from "./app.js";
import { watchEnvFile } from "./dev/env-watch.js";
import { publish, startDevTunnel } from "./dev/tunnel.js";

const app = await buildApp();

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });

// In development the server gives itself a public address and points Twilio at it, so texts and
// calls reach this machine without a second command running.
let tunnel: Awaited<ReturnType<typeof startDevTunnel>> = null;
const stopWatching =
  process.env.NODE_ENV === "production"
    ? () => undefined
    : watchEnvFile(app.log, () => {
        // Something else claimed PUBLIC_API_URL while this server owns a live tunnel. Its URL is
        // the one that works, so take it back and re-point Twilio.
        if (tunnel?.publicUrl && process.env.PUBLIC_API_URL !== tunnel.publicUrl) {
          void publish(tunnel.publicUrl, app.log).catch((err: unknown) => app.log.warn({ err }, "couldn't restore the tunnel URL"));
        }
      });
tunnel = await startDevTunnel(port, app.log);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "shutting down");
    tunnel?.stop();
    stopWatching();
    await app.close();
    await Promise.allSettled([getPrisma().$disconnect(), closeRedis()]);
    process.exit(0);
  });
}
