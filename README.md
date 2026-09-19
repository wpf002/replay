# Relay

Text or call one phone number and get Claude, GPT, or Perplexity on the other end. Relay remembers you and does things: reads and sends email, manages your calendar, sets reminders, and (next) makes calls and runs errands for you.

**Status:** scaffold only. No product code yet. See `ARCHITECTURE.md` for the build order.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Monorepo | pnpm + Turborepo |
| API | Fastify (Twilio webhooks, voice WebSocket, OAuth, mobile API) |
| Jobs | BullMQ on Redis (agent runs, reminders) |
| Web | Next.js App Router (landing, privacy/terms, account) |
| Mobile | Expo + expo-router |
| DB | Postgres via Prisma 7 (`@prisma/adapter-pg`) |
| Telephony | Twilio Programmable Messaging, Voice + ConversationRelay, Verify |
| Models | Anthropic, OpenAI, Perplexity Sonar |
| Hosting | Railway |

## Local setup

Needs Node 22.12+, pnpm 10 (`corepack enable`), Postgres, Redis, and ngrok for Twilio webhooks.

```bash
git clone https://github.com/wpf002/replay.git && cd replay
pnpm install
cp .env.example .env            # fill in keys
docker run -d --name relay-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=relay postgres:17
docker run -d --name relay-redis -p 6379:6379 redis:7
pnpm db:migrate
pnpm dev                        # api :4000, web :3000, worker, expo
ngrok http 4000                 # put the URL in PUBLIC_API_URL
```

Point the Twilio number at the tunnel:

- Messaging webhook: `POST {PUBLIC_API_URL}/twilio/sms`
- Voice webhook: `POST {PUBLIC_API_URL}/twilio/voice`

Mobile: `pnpm --filter @relay/mobile ios` (or `android`), or scan the Expo QR code.

## Environment variables

| Name | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | yes | Local Postgres, or Railway `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | yes | Local Redis, or Railway `${{Redis.REDIS_URL}}` |
| `PUBLIC_API_URL` | yes | ngrok URL locally, Railway api domain in prod |
| `API_PORT` | no | Defaults to 4000; Railway sets `PORT` |
| `TOKEN_ENCRYPTION_KEY` | yes | `openssl rand -base64 32` |
| `JWT_SECRET` | yes | `openssl rand -base64 48` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | yes | Twilio console |
| `TWILIO_PHONE_NUMBER` | yes | Number you buy in Twilio (voice + SMS capable) |
| `TWILIO_MESSAGING_SERVICE_SID` | yes | Messaging Service linked to the 10DLC campaign |
| `TWILIO_VERIFY_SERVICE_SID` | yes | Twilio Verify service |
| `ANTHROPIC_API_KEY` | yes | console.anthropic.com |
| `OPENAI_API_KEY` | yes | platform.openai.com |
| `PERPLEXITY_API_KEY` | yes | Perplexity API settings |
| `DEFAULT_MODEL` | no | `claude` \| `gpt` \| `perplexity` |
| `CLAUDE_MODEL`, `CLAUDE_FAST_MODEL`, `OPENAI_MODEL`, `PERPLEXITY_MODEL` | yes | Current model IDs from each provider's docs |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | yes | Google Cloud console, OAuth client (Gmail + Calendar APIs enabled) |
| `DAILY_SPEND_CAP_CENTS` | no | Per-user model spend cap |
| `NEXT_PUBLIC_API_URL` | yes | api URL for the web app |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_RELAY_NUMBER` | yes | api URL and Relay number for the mobile app |

## Project structure

```
apps/api            Fastify: /twilio/sms, /twilio/voice, /voice/ws, /oauth/google, /v1 mobile API
apps/worker         BullMQ workers: agent turns, reminders
apps/web            Next.js: landing, /privacy, /terms, account
apps/mobile         Expo: onboarding, connect accounts, approvals, settings
packages/agent      router (@claude/@gpt/@web), agent loop, tools, confirmation gate
packages/providers  one adapter per model provider
packages/db         Prisma schema, migrations, client
packages/types      shared types
packages/config     shared tsconfig
```

## Deploy (Railway)

One project with five services: `api`, `worker`, `web`, `Postgres`, `Redis`. Each app service keeps root directory `/` and sets its config file path to `apps/<service>/railway.json`. The `api` service runs `prisma migrate deploy` before starting.

```bash
railway link
railway up --service api
railway up --service worker
railway up --service web
```

Mobile ships through EAS: `eas build` / `eas submit` from `apps/mobile`.

## Conventions

- Every Twilio webhook validates `X-Twilio-Signature`. No exceptions, including local dev.
- STOP / HELP / START are handled before any text reaches the agent.
- Any tool that sends, spends, or contacts a third party creates an `Action` in `AWAITING_CONFIRMATION` and waits for YES. Tool calls triggered while reading email or web content always confirm.
- Voice never trusts caller ID alone for sensitive actions. PIN required.
- OAuth tokens are stored encrypted (`TOKEN_ENCRYPTION_KEY`) and never logged.
- Model IDs live in env, not code.
- New model provider = one file in `packages/providers` implementing `ModelProvider`.
- Packages build to `dist/`; apps import them by workspace name. ESM throughout, `.js` extensions in relative imports.
- Stubs return `501` with a `TODO` naming what they need. No mock data.
