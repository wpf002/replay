import { aiAccounts, deleteModelKey, rateLimit, saveModelKey, startComputerTask, UserError } from "@relay/core";
import { verifyKey } from "@relay/providers";
import { AI_PROVIDERS, detectKeyProvider, MODELS, type AiAccountDTO, type ComputerTaskDTO, type MeDTO } from "@relay/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { toComputerTaskDTO, toMeDTO } from "../../lib/dto.js";
import { currentUser, requireUser } from "../../plugins/auth.js";

const params = z.object({ provider: z.enum(MODELS) });

/** Connect attempts per person per hour. Each one makes a small request on the key. */
const TRIES_PER_HOUR = 10;

/** People connect their own Claude, ChatGPT, and Perplexity API keys. */
export async function aiAccountRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get("/ai-accounts", async (req): Promise<AiAccountDTO[]> => aiAccounts(currentUser(req).id));

  /**
   * Connects the account itself: Relay opens the provider's app in its browser and the person
   * signs in there. After that, their texts become chats in their own history, on their plan.
   */
  app.post("/ai-accounts/:provider/signin", async (req): Promise<ComputerTaskDTO> => {
    const { provider } = params.parse(req.params);
    const info = AI_PROVIDERS[provider];
    const task = await startComputerTask(currentUser(req).id, {
      goal: `Sign in to ${info.name}`,
      startUrl: info.signInUrl,
      mode: "signin",
      provider,
    });
    return toComputerTaskDTO(task, { steps: [] });
  });

  /** Checks the key with the provider, then saves it encrypted. Replaces any key already there. */
  app.put("/ai-accounts/:provider", async (req): Promise<MeDTO> => {
    const { provider } = params.parse(req.params);
    const { key } = z
      .object({ key: z.string().trim().min(20, "That key looks too short. Copy the whole thing.").max(512) })
      .parse(req.body);
    const user = currentUser(req);

    const detected = detectKeyProvider(key);
    if (detected && detected !== provider) {
      const other = AI_PROVIDERS[detected].name;
      throw new UserError(`That's a ${other} key. Connect it under ${other} instead.`, 400, `wrong_provider:${detected}`);
    }
    const limit = await rateLimit(`ai-key:${user.id}`, TRIES_PER_HOUR, 60 * 60);
    if (!limit.allowed) throw new UserError("Too many tries. Wait a few minutes and try again.", 429);

    const verdict = await verifyKey(provider, key);
    if (!verdict.ok) {
      throw new UserError(verdict.message, verdict.problem === "unreachable" ? 502 : 400, verdict.problem);
    }
    await saveModelKey(user.id, provider, key);
    req.log.info({ provider }, "ai account connected");
    return toMeDTO(user);
  });

  app.delete("/ai-accounts/:provider", async (req): Promise<MeDTO> => {
    const { provider } = params.parse(req.params);
    const user = currentUser(req);
    await deleteModelKey(user.id, provider);
    return toMeDTO(user);
  });
}
