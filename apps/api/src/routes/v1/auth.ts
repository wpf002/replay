import {
  checkPhoneVerification,
  env,
  isValidTimeZone,
  log,
  rateLimit,
  startPhoneVerification,
  textUser,
  toDbModel,
  toE164,
  UserError,
} from "@relay/core";
import { getPrisma, type User } from "@relay/db";
import { SMS_CONSENT_VERSION, type AuthSession, type AuthVerifyResult } from "@relay/types";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { signSession, signSignupToken, verifySignupToken } from "../../auth/tokens.js";
import { toMeDTO } from "../../lib/dto.js";
import { currentUser, requireUser } from "../../plugins/auth.js";

const phoneInput = z.string().trim().min(7).max(24);

function e164(phone: string): string {
  const normalized = toE164(phone);
  if (!normalized) throw new UserError("Enter a valid mobile number.");
  return normalized;
}

/** Dev-only bypass for Twilio Verify. env() refuses to load it in production. */
function devCode(): string | undefined {
  return env().NODE_ENV !== "production" ? env().DEV_LOGIN_CODE : undefined;
}

async function limit(key: string, max: number, windowSeconds: number) {
  const res = await rateLimit(key, max, windowSeconds, { failClosed: true });
  if (!res.allowed) throw new UserError("Too many attempts. Try again in a little while.", 429);
}

async function session(user: User): Promise<AuthSession> {
  return { token: await signSession(user), me: await toMeDTO(user) };
}

const WELCOME =
  "Relay: you're in. Text or call this number anytime. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/start", async (req: FastifyRequest) => {
    const { phone } = z.object({ phone: phoneInput }).parse(req.body);
    const number = e164(phone);
    await limit(`auth-start:${number}`, 5, 60 * 60);
    await limit(`auth-start-ip:${req.ip}`, 20, 60 * 60);
    if (!devCode()) await startPhoneVerification(number);
    return { ok: true };
  });

  app.post("/auth/verify", async (req): Promise<AuthVerifyResult> => {
    const { phone, code } = z
      .object({ phone: phoneInput, code: z.string().trim().regex(/^\d{4,10}$/, "Enter the code from the text.") })
      .parse(req.body);
    const number = e164(phone);
    await limit(`auth-verify:${number}`, 10, 60 * 60);

    const dev = devCode();
    const approved = dev ? code === dev : await checkPhoneVerification(number, code);
    if (!approved) throw new UserError("That code didn't work. Check it and try again.");

    const user = await getPrisma().user.findUnique({ where: { phone: number } });
    if (user) return { status: "ok", ...(await session(user)) };
    return {
      status: "needs_signup",
      signupToken: await signSignupToken(number),
      inviteRequired: env().INVITE_ONLY,
    };
  });

  app.post("/auth/signup", async (req): Promise<AuthSession> => {
    const body = z
      .object({
        signupToken: z.string().min(1),
        name: z.string().trim().min(1, "Enter your name.").max(80),
        timezone: z.string().max(64).optional(),
        inviteCode: z.string().trim().max(64).optional(),
        smsConsent: z.literal(true, { error: "Agree to receive texts from Relay to continue." }),
        source: z.enum(["app", "web"]).default("app"),
      })
      .parse(req.body);

    let phone: string;
    try {
      phone = await verifySignupToken(body.signupToken);
    } catch {
      throw new UserError("Your verification expired. Start again.", 401);
    }

    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return session(existing);

    const timezone = body.timezone && isValidTimeZone(body.timezone) ? body.timezone : "America/Chicago";
    const code = body.inviteCode?.toUpperCase();

    const user = await prisma.$transaction(async (tx) => {
      let inviteId: string | null = null;
      if (env().INVITE_ONLY || code) {
        if (!code) throw new UserError("Enter your invite code.");
        const invite = await tx.invite.findUnique({ where: { code } });
        if (!invite || (invite.expiresAt && invite.expiresAt < new Date())) {
          throw new UserError("That invite code isn't valid.");
        }
        // Conditional increment so two signups can't both take the last use.
        const { count } = await tx.invite.updateMany({
          where: { id: invite.id, uses: { lt: invite.maxUses } },
          data: { uses: { increment: 1 } },
        });
        if (count !== 1) throw new UserError("That invite code has been used up.");
        inviteId = invite.id;
      }
      return tx.user.create({
        data: {
          phone,
          name: body.name,
          timezone,
          defaultModel: toDbModel(env().DEFAULT_MODEL),
          smsOptInAt: new Date(),
          smsOptInSource: body.source,
          smsConsentVersion: SMS_CONSENT_VERSION,
          inviteId,
        },
      });
    });

    // Opt-in confirmation text. Signup still succeeds if Twilio isn't reachable.
    textUser({ user, body: WELCOME, metadata: { kind: "welcome" } }).catch((err: unknown) =>
      log.error({ err, userId: user.id }, "welcome text failed"),
    );
    return session(user);
  });

  app.post("/auth/logout-all", { preHandler: requireUser }, async (req) => {
    const user = currentUser(req);
    await getPrisma().user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    return { ok: true };
  });
}
