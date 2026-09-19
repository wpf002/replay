import { setReminder, type ToolContext } from "@relay/agent";
import { closeQueues, closeRedis, getQueue, QUEUE, redis } from "@relay/core";
import { getPrisma, type User } from "@relay/db";
import type { Job } from "bullmq";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processReminder } from "./reminders.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("reminders", () => {
  let user: User;
  let ctx: ToolContext;

  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe('TRUNCATE "User" RESTART IDENTITY CASCADE');
    await redis().flushdb();
    user = await prisma.user.create({ data: { phone: "+15125550155", name: "Rem", smsOptInAt: new Date() } });
    ctx = {
      userId: user.id,
      userName: user.name,
      phone: user.phone,
      timezone: user.timezone,
      channel: "sms",
      conversationId: "",
      now: new Date(),
      hasGoogle: false,
      onUsage: async () => {},
    };
  });

  afterAll(async () => {
    await getQueue(QUEUE.reminders).obliterate({ force: true });
    await closeQueues();
    await closeRedis();
    await getPrisma().$disconnect();
  });

  const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

  it("schedules a delayed job for the reminder", async () => {
    const out = await setReminder.run({ at: inMinutes(20), message: "Call mom" }, ctx);
    const reminder = await getPrisma().reminder.findUniqueOrThrow({ where: { id: String(out.data?.reminderId) } });
    const job = await getQueue(QUEUE.reminders).getJob(reminder.jobId!);
    expect(job?.data).toEqual({ reminderId: reminder.id });
    expect(await job?.isDelayed()).toBe(true);
  });

  it("refuses times in the past", async () => {
    const out = await setReminder.run({ at: inMinutes(-5), message: "Too late" }, ctx);
    expect(out.content).toMatch(/already passed/);
    expect(await getPrisma().reminder.count()).toBe(0);
  });

  const fire = async (reminderId: string) => {
    const r = await getPrisma().reminder.findUniqueOrThrow({ where: { id: reminderId } });
    await processReminder({ id: r.jobId, data: { reminderId } } as Job<{ reminderId: string }>);
  };

  it("texts a one-off reminder once", async () => {
    const out = await setReminder.run({ at: inMinutes(1), message: "Stretch" }, ctx);
    const id = String(out.data?.reminderId);
    await fire(id);
    await fire(id);
    const sent = await getPrisma().message.findMany({ where: { direction: "OUTBOUND" } });
    expect(sent.map((m) => m.content)).toEqual(["Reminder: Stretch"]);
    expect((await getPrisma().reminder.findUniqueOrThrow({ where: { id } })).sentAt).toBeInstanceOf(Date);
  });

  it("reschedules a repeating reminder for the next day", async () => {
    const at = inMinutes(1);
    const out = await setReminder.run({ at, message: "Meds", repeat: "daily" }, ctx);
    const id = String(out.data?.reminderId);
    await fire(id);
    const r = await getPrisma().reminder.findUniqueOrThrow({ where: { id } });
    expect(r.runAt.getTime() - new Date(at).getTime()).toBeGreaterThanOrEqual(23 * 3_600_000);
    expect(await getQueue(QUEUE.reminders).getJob(r.jobId!)).toBeTruthy();
  });

  it("ignores stale jobs after a reminder is canceled", async () => {
    const out = await setReminder.run({ at: inMinutes(1), message: "Gone" }, ctx);
    const id = String(out.data?.reminderId);
    const r = await getPrisma().reminder.findUniqueOrThrow({ where: { id } });
    await getPrisma().reminder.delete({ where: { id } });
    await processReminder({ id: r.jobId, data: { reminderId: id } } as Job<{ reminderId: string }>);
    expect(await getPrisma().message.count()).toBe(0);
  });
});
