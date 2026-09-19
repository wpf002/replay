#!/usr/bin/env bash
# Relay bootstrap. Run from the repo root (empty dir or after git init).
# Idempotent: rewrites scaffold files, never touches .env.
set -euo pipefail

# The scaffold has since been built on. Re-running would overwrite real code (index files,
# package.json, schema), so it stops unless FORCE=1.
if [ -f apps/api/src/app.ts ] && [ "${FORCE:-}" != "1" ]; then
  echo "This repo is past the scaffold stage; bootstrap.sh would overwrite product code."
  echo "Use 'pnpm install' to set up a clone. Re-run with FORCE=1 only on an empty directory."
  exit 1
fi

command -v pnpm >/dev/null || { echo "pnpm required: corepack enable"; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<12)){console.error("Node >=22.12 required");process.exit(1)}'

mkdir -p apps/{api,worker}/src apps/web/app/{privacy,terms} apps/mobile/app \
  packages/{agent,providers,types}/src packages/db/{src,prisma} packages/config

w() { mkdir -p "$(dirname "$1")"; cat > "$1"; }   # write file from heredoc

# ───────────────────────── root ─────────────────────────
w .nvmrc <<'EOF'
22
EOF

w .npmrc <<'EOF'
# Expo/Metro resolves more reliably with a hoisted layout in pnpm monorepos
node-linker=hoisted
EOF

w pnpm-workspace.yaml <<'EOF'
packages:
  - "apps/*"
  - "packages/*"
onlyBuiltDependencies:
  - "@prisma/engines"
  - prisma
  - esbuild
  - msgpackr-extract
EOF

w package.json <<'EOF'
{
  "name": "relay",
  "private": true,
  "packageManager": "pnpm@10.28.0",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "db:migrate": "pnpm --filter @relay/db db:migrate",
    "db:generate": "pnpm --filter @relay/db db:generate",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@eslint/js": "9.39.5",
    "@types/node": "22.20.4",
    "eslint": "9.39.5",
    "prettier": "3.9.8",
    "turbo": "2.11.2",
    "typescript": "6.0.3",
    "typescript-eslint": "8.70.0",
    "vitest": "5.0.1"
  }
}
EOF

w turbo.json <<'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "stream",
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "db:generate": { "cache": false },
    "build": { "dependsOn": ["^build", "db:generate"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "dev": { "dependsOn": ["^build"], "cache": false, "persistent": true },
    "lint": {},
    "typecheck": { "dependsOn": ["^build", "db:generate"] },
    "test": { "dependsOn": ["^build"] },
    "db:migrate": { "cache": false }
  }
}
EOF

w tsconfig.base.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true
  }
}
EOF

# ESLint 9 uses flat config (eslint.config.mjs), not .eslintrc
w eslint.config.mjs <<'EOF'
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/generated/**", "**/.expo/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
);
EOF

w .prettierrc <<'EOF'
{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 100 }
EOF

w .gitignore <<'EOF'
node_modules/
dist/
.next/
.turbo/
.expo/
*.tsbuildinfo
.env
.env.*
!.env.example
packages/db/src/generated/
coverage/
.DS_Store
ios/
android/
EOF

w .env.example <<'EOF'
# ── Core ─────────────────────────────────────────────
NODE_ENV=development
# Postgres. Railway injects this on the api/worker services via ${{Postgres.DATABASE_URL}}
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/relay
# Redis for BullMQ. Railway: ${{Redis.REDIS_URL}}
REDIS_URL=redis://localhost:6379
# Public base URL of apps/api, used to build Twilio webhook + OAuth callback URLs (ngrok locally)
PUBLIC_API_URL=https://your-tunnel.ngrok.app
API_PORT=4000
# 32-byte base64 key for AES-256-GCM encryption of OAuth tokens: openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=
# Signs mobile/web session JWTs: openssl rand -base64 48
JWT_SECRET=

# ── Twilio ───────────────────────────────────────────
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
# The Relay number users text and call (E.164)
TWILIO_PHONE_NUMBER=+15555550100
# Messaging Service tied to the approved A2P 10DLC campaign
TWILIO_MESSAGING_SERVICE_SID=
# Twilio Verify service for phone sign-in codes
TWILIO_VERIFY_SERVICE_SID=

# ── Models ───────────────────────────────────────────
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
PERPLEXITY_API_KEY=
# Default brain for new users: claude | gpt | perplexity
DEFAULT_MODEL=claude
# Model IDs, kept in env so upgrades don't need a deploy
CLAUDE_MODEL=
CLAUDE_FAST_MODEL=
OPENAI_MODEL=
PERPLEXITY_MODEL=sonar-pro

# ── Google OAuth (Gmail + Calendar) ──────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Must match the redirect URI registered in Google Cloud console
GOOGLE_REDIRECT_URI=${PUBLIC_API_URL}/oauth/google/callback

# ── Limits ───────────────────────────────────────────
# Per-user daily model spend cap in USD cents
DAILY_SPEND_CAP_CENTS=300

# ── Web / mobile (public, safe to ship to clients) ───
NEXT_PUBLIC_API_URL=http://localhost:4000
EXPO_PUBLIC_API_URL=http://localhost:4000
EXPO_PUBLIC_RELAY_NUMBER=+15555550100
EOF

# ───────────────────────── packages/config ─────────────────────────
w packages/config/package.json <<'EOF'
{ "name": "@relay/config", "version": "0.0.0", "private": true, "files": ["tsconfig.node.json"] }
EOF
w packages/config/tsconfig.node.json <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "${configDir}/dist", "rootDir": "${configDir}/src", "types": ["node"] },
  "include": ["${configDir}/src"]
}
EOF

# helper: a buildable node library package
lib() { # name deps(json) devDeps(json)
  local dir="packages/$1"
  w "$dir/package.json" <<EOF
{
  "name": "@relay/$1",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": $2,
  "devDependencies": { "@relay/config": "workspace:*" }
}
EOF
  w "$dir/tsconfig.json" <<'EOF'
{ "extends": "../config/tsconfig.node.json" }
EOF
}

# ───────────────────────── packages/types ─────────────────────────
lib types '{}'
w packages/types/src/index.ts <<'EOF'
export const MODELS = ["claude", "gpt", "perplexity"] as const;
export type ModelId = (typeof MODELS)[number];

export type Channel = "sms" | "voice";

/** One inbound turn from any channel, normalized. */
export interface InboundTurn {
  userId: string;
  channel: Channel;
  from: string; // E.164
  text: string;
  providerMessageId?: string;
}

/** Explicit routing prefixes a user can type or say. */
export const ROUTE_PREFIXES: Record<string, ModelId> = {
  "@claude": "claude",
  "@gpt": "gpt",
  "@chatgpt": "gpt",
  "@web": "perplexity",
  "@perplexity": "perplexity",
};
EOF

# ───────────────────────── packages/db (Prisma 7) ─────────────────────────
w packages/db/package.json <<'EOF'
{
  "name": "@relay/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src"
  },
  "dependencies": {
    "@prisma/adapter-pg": "7.10.0",
    "@prisma/client": "7.10.0",
    "pg": "8.23.0"
  },
  "devDependencies": {
    "@relay/config": "workspace:*",
    "@types/pg": "8.23.1",
    "dotenv": "18.0.1",
    "prisma": "7.10.0"
  }
}
EOF
w packages/db/tsconfig.json <<'EOF'
{ "extends": "../config/tsconfig.node.json" }
EOF
w packages/db/prisma.config.ts <<'EOF'
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/relay",
  },
});
EOF
w packages/db/prisma/schema.prisma <<'EOF'
generator client {
  provider            = "prisma-client"
  output              = "../src/generated/prisma"
  moduleFormat        = "esm"
  importFileExtension = "js"
}

datasource db {
  provider = "postgresql"
}

enum Channel {
  SMS
  VOICE
}

enum Direction {
  INBOUND
  OUTBOUND
}

enum Role {
  USER
  ASSISTANT
  TOOL
}

enum ModelId {
  CLAUDE
  GPT
  PERPLEXITY
}

enum OAuthProvider {
  GOOGLE
}

enum ActionStatus {
  PENDING
  AWAITING_CONFIRMATION
  CONFIRMED
  DENIED
  RUNNING
  SUCCEEDED
  FAILED
}

model User {
  id           String       @id @default(cuid())
  phone        String       @unique // E.164
  name         String?
  timezone     String       @default("America/Chicago")
  defaultModel ModelId      @default(CLAUDE)
  pinHash      String?
  smsOptInAt   DateTime?
  smsOptOutAt  DateTime?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  connections   Connection[]
  conversations Conversation[]
  actions       Action[]
  memories      Memory[]
  reminders     Reminder[]
}

model Connection {
  id                String        @id @default(cuid())
  userId            String
  provider          OAuthProvider
  scopes            String[]
  accessTokenEnc    String
  refreshTokenEnc   String?
  expiresAt         DateTime?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  user              User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider])
}

model Conversation {
  id        String    @id @default(cuid())
  userId    String
  channel   Channel
  callSid   String?   @unique
  startedAt DateTime  @default(now())
  endedAt   DateTime?
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  Message[]

  @@index([userId, startedAt])
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  direction      Direction
  role           Role
  model          ModelId?
  content        String
  twilioSid      String?      @unique
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
}

model Action {
  id                   String       @id @default(cuid())
  userId               String
  type                 String // e.g. gmail.send, calendar.create
  status               ActionStatus @default(PENDING)
  payload              Json
  result               Json?
  requiresConfirmation Boolean      @default(true)
  confirmedAt          DateTime?
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt
  user                 User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status])
}

model Memory {
  id              String   @id @default(cuid())
  userId          String
  fact            String
  sourceMessageId String?
  createdAt       DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Reminder {
  id     String    @id @default(cuid())
  userId String
  runAt  DateTime
  body   String
  jobId  String?
  sentAt DateTime?
  user   User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([runAt])
}
EOF
w packages/db/src/index.ts <<'EOF'
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export * from "./generated/prisma/client.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return globalForPrisma.prisma;
}
EOF

# ───────────────────────── packages/providers ─────────────────────────
lib providers '{ "@anthropic-ai/sdk": "0.127.0", "openai": "7.19.0", "@relay/types": "workspace:*" }'
w packages/providers/src/index.ts <<'EOF'
import type { ModelId } from "@relay/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Every model sits behind this. Adding a provider = one new file implementing it. */
export interface ModelProvider {
  id: ModelId;
  complete(system: string, messages: ChatMessage[]): Promise<string>;
}

// TODO: claude.ts (@anthropic-ai/sdk), openai.ts (openai), perplexity.ts
// (OpenAI-compatible client pointed at https://api.perplexity.ai).
EOF

# ───────────────────────── packages/agent ─────────────────────────
lib agent '{ "@relay/types": "workspace:*", "@relay/providers": "workspace:*", "zod": "4.6.5" }'
w packages/agent/src/index.ts <<'EOF'
import { ROUTE_PREFIXES, type ModelId } from "@relay/types";

/** Strip a leading @model prefix and return which model it selects. */
export function parseRoute(text: string, fallback: ModelId): { model: ModelId; text: string } {
  const match = /^\s*(@\w+)\b[\s,:]*/i.exec(text);
  const prefix = match?.[1]?.toLowerCase();
  const model = prefix ? ROUTE_PREFIXES[prefix] : undefined;
  if (!match || !model) return { model: fallback, text: text.trim() };
  return { model, text: text.slice(match[0].length).trim() };
}

// TODO: agent loop, tool registry (gmail, calendar, reminders, web_search, memory),
// confirmation gate for any tool that sends, spends, or contacts a third party.
EOF

# ───────────────────────── apps/api (Fastify) ─────────────────────────
w apps/api/package.json <<'EOF'
{
  "name": "@relay/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../../.env src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@fastify/cors": "11.3.0",
    "@fastify/formbody": "9.0.0",
    "@fastify/sensible": "6.0.5",
    "@fastify/websocket": "11.3.1",
    "@relay/agent": "workspace:*",
    "@relay/db": "workspace:*",
    "@relay/types": "workspace:*",
    "bullmq": "6.3.8",
    "fastify": "5.12.5",
    "googleapis": "181.0.0",
    "ioredis": "6.0.0",
    "jose": "6.2.12",
    "libphonenumber-js": "1.13.13",
    "pino": "10.3.1",
    "twilio": "6.1.1",
    "zod": "4.6.5"
  },
  "devDependencies": { "@relay/config": "workspace:*", "tsx": "4.23.13" }
}
EOF
w apps/api/tsconfig.json <<'EOF'
{ "extends": "../../packages/config/tsconfig.node.json" }
EOF
w apps/api/src/index.ts <<'EOF'
import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));

// TODO: POST /twilio/sms       (validate signature, STOP/HELP, enqueue turn)
// TODO: POST /twilio/voice     (TwiML <Connect><ConversationRelay url=".../voice/ws"/>)
// TODO: GET  /voice/ws         (ConversationRelay WebSocket)
// TODO: GET  /oauth/google/*   (connect Gmail + Calendar)
// TODO: /v1/*                  (mobile API: auth, settings, history, approvals)

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
EOF

# ───────────────────────── apps/worker (BullMQ) ─────────────────────────
w apps/worker/package.json <<'EOF'
{
  "name": "@relay/worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../../.env src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@relay/agent": "workspace:*",
    "@relay/db": "workspace:*",
    "@relay/providers": "workspace:*",
    "@relay/types": "workspace:*",
    "bullmq": "6.3.8",
    "googleapis": "181.0.0",
    "ioredis": "6.0.0",
    "pino": "10.3.1",
    "twilio": "6.1.1"
  },
  "devDependencies": { "@relay/config": "workspace:*", "tsx": "4.23.13" }
}
EOF
w apps/worker/tsconfig.json <<'EOF'
{ "extends": "../../packages/config/tsconfig.node.json" }
EOF
w apps/worker/src/index.ts <<'EOF'
import { pino } from "pino";

const log = pino();
log.info("relay worker booted");

// TODO: BullMQ Worker on queue "turns": load user + history, run agent, send SMS reply.
// TODO: BullMQ Worker on queue "reminders": delayed jobs that text the user.
EOF

# ───────────────────────── apps/web (Next.js) ─────────────────────────
w apps/web/package.json <<'EOF'
{
  "name": "@relay/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port ${PORT:-3000}",
    "typecheck": "tsc --noEmit",
    "lint": "eslint app"
  },
  "dependencies": { "next": "16.3.5", "react": "19.2.3", "react-dom": "19.2.3" },
  "devDependencies": { "@types/react": "19.2.18", "@types/react-dom": "19.2.7" }
}
EOF
w apps/web/tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2023"],
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF
w apps/web/next.config.ts <<'EOF'
import type { NextConfig } from "next";
const config: NextConfig = { reactStrictMode: true };
export default config;
EOF
w apps/web/app/layout.tsx <<'EOF'
export const metadata = { title: "Relay", description: "Text or call your AI." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
EOF
w apps/web/app/page.tsx <<'EOF'
export default function Home() {
  return (
    <main>
      <h1>Relay</h1>
      <p>Text or call one number. Claude, GPT, and Perplexity on the other end.</p>
    </main>
  );
}
EOF
# Required for A2P 10DLC campaign registration. Replace with real policy text before submitting.
w apps/web/app/privacy/page.tsx <<'EOF'
export default function Privacy() {
  return <main><h1>Privacy Policy</h1><p>TODO: real policy before 10DLC submission.</p></main>;
}
EOF
w apps/web/app/terms/page.tsx <<'EOF'
export default function Terms() {
  return <main><h1>Terms of Service</h1><p>TODO: real terms, incl. SMS program terms (frequency, STOP/HELP, rates).</p></main>;
}
EOF

# ───────────────────────── apps/mobile (Expo) ─────────────────────────
w apps/mobile/package.json <<'EOF'
{
  "name": "@relay/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "ios": "expo start --ios",
    "android": "expo start --android",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "expo": "57.0.24",
    "expo-auth-session": "~57.0.12",
    "expo-constants": "~57.0.19",
    "expo-linking": "~57.0.10",
    "expo-router": "~57.0.22",
    "expo-secure-store": "~57.0.4",
    "expo-status-bar": "~57.0.1",
    "expo-web-browser": "~57.0.3",
    "react": "19.2.3",
    "react-native": "0.86.3",
    "react-native-safe-area-context": "~5.7.0",
    "react-native-screens": "~4.26.0"
  },
  "devDependencies": { "@types/react": "19.2.18" }
}
EOF
w apps/mobile/app.json <<'EOF'
{
  "expo": {
    "name": "Relay",
    "slug": "relay",
    "scheme": "relay",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "plugins": ["expo-router", "expo-secure-store"],
    "ios": { "bundleIdentifier": "com.wpf002.relay" },
    "android": { "package": "com.wpf002.relay" }
  }
}
EOF
w apps/mobile/tsconfig.json <<'EOF'
{ "extends": "expo/tsconfig.base", "compilerOptions": { "strict": true } }
EOF
w apps/mobile/app/_layout.tsx <<'EOF'
import { Stack } from "expo-router";

export default function Layout() {
  return <Stack />;
}
EOF
w apps/mobile/app/index.tsx <<'EOF'
import { Text, View } from "react-native";

// TODO: onboarding (phone verify + SMS consent), connect Google, settings, approvals.
export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Relay</Text>
    </View>
  );
}
EOF

# ───────────────────────── Railway ─────────────────────────
# One Railway project, services: api, worker, web, Postgres, Redis.
# Each service's Root Directory stays "/" (monorepo); config file path points at its railway.json.
for svc in api worker web; do
  w "apps/$svc/railway.json" <<EOF
{
  "\$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "RAILPACK",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm turbo run build --filter=@relay/$svc",
    "watchPatterns": ["apps/$svc/**", "packages/**", "pnpm-lock.yaml"]
  },
  "deploy": {
    "startCommand": "$( [ "$svc" = api ] && echo 'pnpm --filter @relay/db db:deploy && ' )pnpm --filter @relay/$svc start",
    "restartPolicyType": "ON_FAILURE"
  }
}
EOF
done

# ───────────────────────── install ─────────────────────────
pnpm install
pnpm db:generate

echo
echo "Relay scaffold ready."
echo "Next: cp .env.example .env, fill keys, start Postgres + Redis, then pnpm db:migrate && pnpm dev"
