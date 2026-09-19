import { createInvites } from "@relay/core";
import { getPrisma } from "@relay/db";
import { parseArgs } from "node:util";

// pnpm --filter @relay/api invite:create -- --count 5 --uses 1 --note "beta friends" --days 30
// pnpm --filter @relay/api invite:list

const [command = "list", ...rest] = process.argv.slice(2).filter((a) => a !== "--");
const { values } = parseArgs({
  args: rest,
  options: {
    count: { type: "string", default: "1" },
    uses: { type: "string", default: "1" },
    note: { type: "string" },
    days: { type: "string" },
  },
});

const prisma = getPrisma();

if (command === "create") {
  const days = values.days ? Number(values.days) : undefined;
  const invites = await createInvites({
    count: Math.max(1, Number(values.count)),
    maxUses: Math.max(1, Number(values.uses)),
    ...(values.note ? { note: values.note } : {}),
    ...(days ? { expiresAt: new Date(Date.now() + days * 86_400_000) } : {}),
  });
  for (const invite of invites) {
    const expires = invite.expiresAt ? `, expires ${invite.expiresAt.toISOString().slice(0, 10)}` : "";
    console.log(`${invite.code}  (${invite.maxUses} use${invite.maxUses === 1 ? "" : "s"}${expires})`);
  }
} else if (command === "list") {
  const invites = await prisma.invite.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  if (!invites.length) console.log("No invites yet. Create some with invite:create.");
  for (const i of invites) {
    const expired = i.expiresAt && i.expiresAt < new Date() ? " expired" : "";
    console.log(`${i.code}  ${i.uses}/${i.maxUses} used${expired}${i.note ? `  ${i.note}` : ""}`);
  }
} else {
  console.error(`Unknown command "${command}". Use create or list.`);
  process.exitCode = 1;
}

await prisma.$disconnect();
