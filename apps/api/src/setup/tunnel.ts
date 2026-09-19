import { log } from "@relay/core";
import { openTunnel, publish } from "../dev/tunnel.js";
import { bad, bold, note, ok } from "./prompt.js";

// pnpm tunnel: the Cloudflare quick tunnel on its own. pnpm dev already starts one; this is for
// pointing Twilio at a server that's running somewhere else, or at a restarted API.

const port = Number(process.env.API_PORT ?? 4000);
const tunnel = openTunnel(port);

try {
  const url = await tunnel.url;
  await publish(url, log);
  ok(`Tunnel up: ${bold(url)} → localhost:${port}`);
  note("Leave this running. Ctrl+C closes the tunnel.");
} catch (err) {
  bad((err as Error).message);
  tunnel.stop();
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    tunnel.stop();
    process.exit(0);
  });
}
