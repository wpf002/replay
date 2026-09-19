import { randomInt } from "node:crypto";
import { getPrisma, type Invite } from "@relay/db";

// No 0/O, 1/I/L: codes get read aloud and typed on phones.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateInviteCode(): string {
  const pick = () => ALPHABET[randomInt(ALPHABET.length)];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `${block()}-${block()}`;
}

export async function createInvites(opts: {
  count: number;
  maxUses: number;
  note?: string;
  expiresAt?: Date;
}): Promise<Invite[]> {
  const prisma = getPrisma();
  const invites: Invite[] = [];
  while (invites.length < opts.count) {
    const code = generateInviteCode();
    if (await prisma.invite.findUnique({ where: { code } })) continue;
    invites.push(
      await prisma.invite.create({
        data: {
          code,
          maxUses: opts.maxUses,
          note: opts.note ?? null,
          expiresAt: opts.expiresAt ?? null,
        },
      }),
    );
  }
  return invites;
}
