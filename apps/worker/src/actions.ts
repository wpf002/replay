import { findTool, type ToolContext } from "@relay/agent";
import {
  GoogleNotConnectedError,
  log,
  recordUsage,
  textUser,
  UserError,
  type ActionJob,
} from "@relay/core";
import { getPrisma, type Prisma } from "@relay/db";
import { NotConfiguredError } from "@relay/types";
import type { Job } from "bullmq";

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? text;
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

/** A failure message safe to text the user. Internal errors get a generic line. */
function userFacing(err: unknown): string {
  if (err instanceof GoogleNotConnectedError || err instanceof UserError) return err.message;
  if (err instanceof NotConfiguredError) return "That feature isn't set up on the server yet.";
  return "Something went wrong on my end.";
}

/** Runs an action the user approved, then texts them the result. */
export async function processAction(job: Job<ActionJob>): Promise<void> {
  const prisma = getPrisma();
  const { actionId } = job.data;

  // CONFIRMED -> RUNNING exactly once, even if the job is delivered twice.
  const { count } = await prisma.action.updateMany({
    where: { id: actionId, status: "CONFIRMED" },
    data: { status: "RUNNING" },
  });
  if (count !== 1) return;

  const action = await prisma.action.findUniqueOrThrow({ where: { id: actionId }, include: { user: true } });
  const { user } = action;
  const tool = findTool(action.type);

  const fail = async (err: unknown) => {
    const detail = err instanceof Error ? err.message : String(err);
    log.error({ err, actionId, type: action.type }, "action failed");
    await prisma.action.update({
      where: { id: actionId },
      data: { status: "FAILED", error: detail.slice(0, 500), completedAt: new Date() },
    });
    await textUser({
      user,
      body: `Couldn't finish "${firstLine(action.summary)}". ${userFacing(err)}`,
      metadata: { kind: "receipt", actionId },
    });
  };

  if (!tool) return fail(new Error(`No tool named ${action.type}`));

  const google = await prisma.connection.findUnique({
    where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
    select: { id: true },
  });
  const ctx: ToolContext = {
    userId: user.id,
    userName: user.name,
    phone: user.phone,
    timezone: user.timezone,
    channel: action.channel === "VOICE" ? "voice" : "sms",
    conversationId: action.conversationId ?? "",
    actionId: action.id,
    now: new Date(),
    hasGoogle: Boolean(google),
    onUsage: (provider, usage, model) =>
      recordUsage({ userId: user.id, provider, model, channel: action.channel, ...usage }),
  };

  try {
    const input = tool.input.parse(action.payload);
    const out = await tool.run(input, ctx);
    // Some actions finish later (a phone call in progress); they report back on their own.
    const stillRunning = out.data?.inProgress === true;
    await prisma.action.update({
      where: { id: actionId },
      data: {
        status: stillRunning ? "RUNNING" : "SUCCEEDED",
        result: { content: out.content, ...(out.data ?? {}) } as Prisma.InputJsonValue,
        ...(stillRunning ? {} : { completedAt: new Date() }),
      },
    });
    await textUser({
      user,
      body: out.receipt ?? "Done.",
      metadata: { kind: "receipt", actionId },
    });
  } catch (err) {
    await fail(err);
  }
}
