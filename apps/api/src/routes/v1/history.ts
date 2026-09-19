import { UserError } from "@relay/core";
import { getPrisma } from "@relay/db";
import type { HistoryItemDTO, MemoryDTO } from "@relay/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { toHistoryItem, toMemoryDTO } from "../../lib/dto.js";
import { currentUser, requireUser } from "../../plugins/auth.js";

export async function historyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  /** Messages across texts and calls, newest first. Page with ?before=<createdAt of the last item>. */
  app.get("/history", async (req): Promise<{ items: HistoryItemDTO[]; nextBefore: string | null }> => {
    const { before, limit } = z
      .object({
        before: z.iso.datetime().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(40),
      })
      .parse(req.query);
    const rows = await getPrisma().message.findMany({
      where: {
        conversation: { userId: currentUser(req).id },
        role: { in: ["USER", "ASSISTANT"] },
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: { conversation: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return {
      items: rows.map(toHistoryItem),
      nextBefore: rows.length === limit ? rows.at(-1)!.createdAt.toISOString() : null,
    };
  });

  app.get("/memories", async (req): Promise<{ items: MemoryDTO[] }> => {
    const rows = await getPrisma().memory.findMany({
      where: { userId: currentUser(req).id },
      orderBy: { createdAt: "desc" },
    });
    return { items: rows.map(toMemoryDTO) };
  });

  app.delete("/memories/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { count } = await getPrisma().memory.deleteMany({ where: { id, userId: currentUser(req).id } });
    if (!count) throw new UserError("Not found.", 404);
    return { ok: true };
  });
}
