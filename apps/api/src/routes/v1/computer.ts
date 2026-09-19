import {
  ACTIVE_TASK_STATUSES,
  enqueueBrowserWipe,
  pushComputerSignal,
  readScreen,
  screenVersions,
  startComputerTask,
  UserError,
} from "@relay/core";
import { getPrisma, type ComputerTask } from "@relay/db";
import type { ComputerTaskDTO } from "@relay/types";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { toComputerTaskDTO } from "../../lib/dto.js";
import { currentUser, requireUser } from "../../plugins/auth.js";

const idParam = z.object({ id: z.string().min(1).max(40) });

const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), x: z.number().min(0).max(4000), y: z.number().min(0).max(4000) }),
  z.object({ type: z.literal("type"), text: z.string().min(1).max(500) }),
  z.object({ type: z.literal("key"), key: z.enum(["Enter", "Tab", "Backspace", "Escape"]) }),
  z.object({ type: z.literal("scroll"), direction: z.enum(["up", "down"]) }),
  z.object({ type: z.literal("navigate"), url: z.string().url().max(2000) }),
  z.object({ type: z.literal("back") }),
]);

/** Relay's browser: tasks, the live view, and the person taking over to sign in. */
export async function computerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  async function ownTask(req: FastifyRequest): Promise<ComputerTask> {
    const { id } = idParam.parse(req.params);
    const task = await getPrisma().computerTask.findFirst({ where: { id, userId: currentUser(req).id } });
    if (!task) throw new UserError("That task doesn't exist.", 404);
    return task;
  }

  async function detail(task: ComputerTask): Promise<ComputerTaskDTO> {
    const prisma = getPrisma();
    const [steps, action, versions] = await Promise.all([
      prisma.computerStep.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "desc" }, take: 60 }),
      task.actionId ? prisma.action.findUnique({ where: { id: task.actionId } }) : null,
      screenVersions([task.id]),
    ]);
    return toComputerTaskDTO(task, { steps: steps.reverse(), action, screenVersion: versions.get(task.id) ?? null });
  }

  app.get("/computer/tasks", async (req): Promise<{ active: ComputerTaskDTO[]; recent: ComputerTaskDTO[] }> => {
    const userId = currentUser(req).id;
    const prisma = getPrisma();
    const [active, recent] = await Promise.all([
      prisma.computerTask.findMany({ where: { userId, status: { in: [...ACTIVE_TASK_STATUSES] } }, orderBy: { createdAt: "desc" } }),
      prisma.computerTask.findMany({
        where: { userId, status: { notIn: [...ACTIVE_TASK_STATUSES] }, mode: "browse" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);
    const versions = await screenVersions(active.map((t) => t.id));
    return {
      active: active.map((t) => toComputerTaskDTO(t, { screenVersion: versions.get(t.id) ?? null })),
      recent: recent.map((t) => toComputerTaskDTO(t)),
    };
  });

  app.get("/computer/tasks/:id", async (req) => detail(await ownTask(req)));

  /** The latest screenshot of the task's browser. */
  app.get("/computer/tasks/:id/screen", async (req, reply) => {
    const task = await ownTask(req);
    const jpeg = await readScreen(task.id);
    if (!jpeg) return reply.code(404).send({ error: "No screen yet." });
    return reply.header("content-type", "image/jpeg").header("cache-control", "private, no-store").send(jpeg);
  });

  /** Starts a task from the app. Texts are the usual way; this is the same thing. */
  app.post("/computer/tasks", async (req) => {
    const body = z
      .object({ task: z.string().trim().min(10, "Say a bit more about what to do.").max(2000), startUrl: z.string().url().optional() })
      .parse(req.body);
    const task = await startComputerTask(currentUser(req).id, { goal: body.task, startUrl: body.startUrl ?? null });
    return detail(task);
  });

  /** Opens a site in Relay's browser so the person can sign in; tasks then use that account. */
  app.post("/computer/signin", async (req) => {
    const { url } = z.object({ url: z.string().trim().min(3).max(2000) }).parse(req.body);
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    let host: string;
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("scheme");
      host = parsed.hostname.replace(/^www\./, "");
    } catch {
      throw new UserError("Enter a website, like instacart.com.");
    }
    const task = await startComputerTask(currentUser(req).id, { goal: `Sign in to ${host}`, startUrl: normalized, mode: "signin" });
    return detail(task);
  });

  /** A tap, typing, or key press while the person has control. Never stored or logged. */
  app.post("/computer/tasks/:id/input", async (req) => {
    const task = await ownTask(req);
    if (task.status !== "WAITING_USER" || task.waitingKind !== "takeover") {
      throw new UserError("Relay has the browser right now.", 409);
    }
    await pushComputerSignal(task.id, { type: "input", input: inputSchema.parse(req.body) });
    return { ok: true };
  });

  app.post("/computer/tasks/:id/resume", async (req) => {
    const task = await ownTask(req);
    if (task.status !== "WAITING_USER" || task.waitingKind !== "takeover") throw new UserError("Relay isn't waiting on you.", 409);
    await pushComputerSignal(task.id, { type: "resume" });
    return { ok: true };
  });

  app.post("/computer/tasks/:id/answer", async (req) => {
    const task = await ownTask(req);
    const { text } = z.object({ text: z.string().trim().min(1).max(1000) }).parse(req.body);
    if (task.status !== "WAITING_USER" || task.waitingKind !== "answer") throw new UserError("Relay isn't waiting on an answer.", 409);
    await pushComputerSignal(task.id, { type: "answer", text });
    return { ok: true };
  });

  app.post("/computer/tasks/:id/cancel", async (req) => {
    const task = await ownTask(req);
    if (task.status === "QUEUED") {
      await getPrisma().computerTask.update({
        where: { id: task.id },
        data: { status: "CANCELED", summary: "Stopped.", endedAt: new Date() },
      });
    } else if ((ACTIVE_TASK_STATUSES as readonly string[]).includes(task.status)) {
      await pushComputerSignal(task.id, { type: "cancel" });
    }
    return { ok: true };
  });

  /** Signs Relay's browser out of every site by deleting the person's browser profile. */
  app.delete("/computer/profile", async (req) => {
    const userId = currentUser(req).id;
    const active = await getPrisma().computerTask.count({ where: { userId, status: { in: [...ACTIVE_TASK_STATUSES] } } });
    if (active) throw new UserError("Wait for Relay's browser tasks to finish first.", 409);
    await enqueueBrowserWipe(userId);
    return { ok: true };
  });
}
