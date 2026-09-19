import { pino } from "pino";

const log = pino();
log.info("relay worker booted");

// TODO: BullMQ Worker on queue "turns": load user + history, run agent, send SMS reply.
// TODO: BullMQ Worker on queue "reminders": delayed jobs that text the user.
