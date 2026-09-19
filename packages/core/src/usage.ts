import { getPrisma, type Channel } from "@relay/db";
import type { ModelId } from "@relay/types";
import { env } from "./env.js";
import { toDbModel } from "./models.js";
import { startOfDay } from "./time.js";

export interface UsageRecord {
  userId: string;
  provider: ModelId;
  model: string;
  channel: Channel | null;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  /** Paid by the person's own key. */
  byok?: boolean;
}

export async function recordUsage(u: UsageRecord): Promise<void> {
  await getPrisma().usage.create({
    data: {
      userId: u.userId,
      model: toDbModel(u.provider),
      providerModel: u.model,
      channel: u.channel,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      costMicros: u.costMicros,
      byok: u.byok ?? false,
    },
  });
}

export interface SpendStatus {
  spentCents: number;
  capCents: number;
  over: boolean;
  resetsAt: Date;
}

/**
 * Spend on Relay's keys since local midnight in the user's time zone, against
 * DAILY_SPEND_CAP_CENTS. Usage on the person's own keys doesn't count.
 */
export async function dailySpend(userId: string, timezone: string): Promise<SpendStatus> {
  const since = startOfDay(timezone);
  const agg = await getPrisma().usage.aggregate({
    where: { userId, byok: false, createdAt: { gte: since } },
    _sum: { costMicros: true },
  });
  const spentCents = (agg._sum.costMicros ?? 0) / 10_000;
  const capCents = env().DAILY_SPEND_CAP_CENTS;
  return {
    spentCents,
    capCents,
    over: spentCents >= capCents,
    resetsAt: new Date(since.getTime() + 86_400_000),
  };
}
