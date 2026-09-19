import { closeQueues, closeRedis, env, log, QUEUE } from "@relay/core";
import { getPrisma } from "@relay/db";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { processAction } from "./actions.js";
import { processReminder } from "./reminders.js";
import { processTurn } from "./turns.js";

// Workers hold blocking connections, so they get their own instead of sharing the producer's.
const connection = new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });

const workers = [
  new Worker(QUEUE.turns, processTurn, { connection, concurrency: 8 }),
  new Worker(QUEUE.actions, processAction, { connection, concurrency: 4 }),
  new Worker(QUEUE.reminders, processReminder, { connection, concurrency: 8 }),
];

for (const worker of workers) {
  worker.on("failed", (job, err) => {
    log.error({ err, queue: worker.name, jobId: job?.id, attempts: job?.attemptsMade }, "job failed");
  });
  worker.on("error", (err) => log.error({ err, queue: worker.name }, "worker error"));
}

log.info({ queues: workers.map((w) => w.name) }, "relay worker started");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    log.info({ signal }, "worker shutting down");
    await Promise.allSettled(workers.map((w) => w.close()));
    await Promise.allSettled([closeQueues(), closeRedis(), connection.quit(), getPrisma().$disconnect()]);
    process.exit(0);
  });
}
