import {
  ACTIVE_TASK_STATUSES,
  cancelReminderJob,
  enqueueBrowserWipe,
  pushComputerSignal,
  checkPin,
  disconnectGoogle,
  hashPin,
  isValidTimeZone,
  log,
  PIN_PATTERN,
  toDbModel,
  UserError,
} from "@relay/core";
import { getPrisma } from "@relay/db";
import { MODELS, type MeDTO } from "@relay/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { toMeDTO } from "../../lib/dto.js";
import { currentUser, requireUser } from "../../plugins/auth.js";

const pinField = z.string().regex(PIN_PATTERN, "PINs are 4 to 8 digits.");

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get("/me", async (req): Promise<MeDTO> => toMeDTO(currentUser(req)));

  app.patch("/me", async (req): Promise<MeDTO> => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        timezone: z
          .string()
          .refine(isValidTimeZone, "Unknown time zone.")
          .optional(),
        defaultModel: z.enum(MODELS).optional(),
      })
      .parse(req.body);
    const user = await getPrisma().user.update({
      where: { id: currentUser(req).id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.timezone ? { timezone: body.timezone } : {}),
        ...(body.defaultModel ? { defaultModel: toDbModel(body.defaultModel) } : {}),
      },
    });
    return toMeDTO(user);
  });

  app.put("/me/pin", async (req): Promise<MeDTO> => {
    const { pin, currentPin } = z
      .object({ pin: pinField, currentPin: z.string().optional() })
      .parse(req.body);
    const user = currentUser(req);
    if (user.pinHash) {
      if (!currentPin) throw new UserError("Enter your current PIN.");
      const check = await checkPin(user, currentPin);
      if (check === "locked") throw new UserError("Too many wrong PINs. Try again in an hour.", 423);
      if (check !== "ok") throw new UserError("Your current PIN didn't match.");
    }
    const updated = await getPrisma().user.update({
      where: { id: user.id },
      data: { pinHash: await hashPin(pin), pinFailures: 0, pinLockedUntil: null },
    });
    return toMeDTO(updated);
  });

  app.delete("/me/pin", async (req): Promise<MeDTO> => {
    const { currentPin } = z.object({ currentPin: z.string() }).parse(req.body);
    const user = currentUser(req);
    const check = await checkPin(user, currentPin);
    if (check === "locked") throw new UserError("Too many wrong PINs. Try again in an hour.", 423);
    if (check === "wrong") throw new UserError("That PIN didn't match.");
    const updated = await getPrisma().user.update({
      where: { id: user.id },
      data: { pinHash: null, pinFailures: 0, pinLockedUntil: null },
    });
    return toMeDTO(updated);
  });

  /** Deletes the account and everything in it. Google access is revoked first. */
  app.delete("/me", async (req) => {
    const user = currentUser(req);
    const prisma = getPrisma();
    await disconnectGoogle(user.id);
    const reminders = await prisma.reminder.findMany({
      where: { userId: user.id, sentAt: null, jobId: { not: null } },
      select: { jobId: true },
    });
    await Promise.all(
      reminders.map((r) =>
        cancelReminderJob(r.jobId!).catch((err: unknown) =>
          log.warn({ err, jobId: r.jobId }, "failed to remove reminder job"),
        ),
      ),
    );
    // Running browser tasks stop, and the browser profile (their site sign-ins) is deleted.
    const tasks = await prisma.computerTask.findMany({
      where: { userId: user.id, status: { in: [...ACTIVE_TASK_STATUSES] } },
      select: { id: true },
    });
    await Promise.all(tasks.map((t) => pushComputerSignal(t.id, { type: "cancel" })));
    await enqueueBrowserWipe(user.id);
    await prisma.user.delete({ where: { id: user.id } });
    return { ok: true };
  });
}
