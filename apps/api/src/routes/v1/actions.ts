import { pendingActions } from "@relay/agent";
import { checkPin, confirmActions, denyActions, UserError } from "@relay/core";
import { getPrisma } from "@relay/db";
import type { ActionDTO } from "@relay/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { toActionDTO } from "../../lib/dto.js";
import { currentUser, requireUser } from "../../plugins/auth.js";

const params = z.object({ id: z.string().min(1) });

export async function actionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get("/actions", async (req): Promise<{ pending: ActionDTO[]; recent: ActionDTO[] }> => {
    const user = currentUser(req);
    const [pending, recent] = await Promise.all([
      pendingActions(user.id),
      getPrisma().action.findMany({
        where: { userId: user.id, status: { not: "AWAITING_CONFIRMATION" } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
    return { pending: pending.map(toActionDTO), recent: recent.map(toActionDTO) };
  });

  /** Approve from the app instead of texting YES. PIN-gated actions need the PIN here too. */
  app.post("/actions/:id/approve", async (req): Promise<ActionDTO> => {
    const { id } = params.parse(req.params);
    const { pin } = z.object({ pin: z.string().optional() }).parse(req.body ?? {});
    const user = currentUser(req);
    const action = await getPrisma().action.findFirst({ where: { id, userId: user.id } });
    if (!action) throw new UserError("Not found.", 404);
    if (action.status !== "AWAITING_CONFIRMATION" || (action.expiresAt && action.expiresAt < new Date())) {
      throw new UserError("This request isn't waiting for approval anymore.", 409);
    }
    if (action.requiresPin) {
      if (!pin) throw new UserError("Enter your PIN to approve this.", 400);
      const check = await checkPin(user, pin);
      if (check === "locked") throw new UserError("Too many wrong PINs. Try again in an hour.", 423);
      if (check === "wrong") throw new UserError("That PIN didn't match.");
    }
    const [confirmed] = await confirmActions(user.id, [id]);
    if (!confirmed) throw new UserError("This request isn't waiting for approval anymore.", 409);
    return toActionDTO(confirmed);
  });

  app.post("/actions/:id/deny", async (req): Promise<ActionDTO> => {
    const { id } = params.parse(req.params);
    const user = currentUser(req);
    await denyActions(user.id, [id]);
    const action = await getPrisma().action.findFirst({ where: { id, userId: user.id } });
    if (!action) throw new UserError("Not found.", 404);
    return toActionDTO(action);
  });
}
