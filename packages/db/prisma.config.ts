import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Scripts run from packages/db; the monorepo keeps one .env at the root.
config({ path: ["../../.env", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/relay",
  },
});
