import { closeRedis } from "@relay/core";
import { getPrisma } from "@relay/db";
import { buildApp } from "./app.js";

const app = await buildApp();

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await Promise.allSettled([getPrisma().$disconnect(), closeRedis()]);
    process.exit(0);
  });
}
