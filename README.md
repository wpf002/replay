# Relay

Text or call one phone number and get Claude, GPT, or Perplexity on the other end. Relay remembers you and does things: reads and sends email, manages your calendar, sets reminders, and calls businesses to book things for you.

**Status:** v1 built end to end (build order steps 2 through 7, plus spend caps and invite codes). Not deployed. Billing isn't built; `GET /v1/billing` returns 501. See `ARCHITECTURE.md` for the design.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Monorepo | pnpm + Turborepo |
| API | Fastify (Twilio webhooks, voice WebSocket, OAuth, `/v1` app API) |
| Jobs | BullMQ on Redis (agent turns, approved actions, reminders) |
| Web | Next.js App Router (landing, waitlist, privacy/terms, account) |
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
cp .env.example .env            # fill in keys; see the table below
docker run -d --name relay-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=relay postgres:17
docker run -d --name relay-redis -p 6379:6379 redis:7
pnpm db:migrate
pnpm --filter @relay/api invite:create -- --count 3 --uses 1   # prints invite codes
pnpm dev                        # api :4000, web :3000, worker, expo
ngrok http 4000                 # put the URL in PUBLIC_API_URL
```

Without Twilio Verify, set `DEV_LOGIN_CODE=424242` in `.env` and use that code to sign in. The API refuses to start with it set when `NODE_ENV=production`.

Mobile: `pnpm --filter @relay/mobile ios` (or `android`), or scan the Expo QR code. On a physical phone, set `EXPO_PUBLIC_API_URL` to your machine's LAN address or the ngrok URL.

### Twilio

- Messaging webhook: `POST {PUBLIC_API_URL}/twilio/sms`
- Voice webhook: `POST {PUBLIC_API_URL}/twilio/voice`
- Outbound call status goes to `{PUBLIC_API_URL}/twilio/call-status` automatically.
- In the Messaging Service's Advanced Opt-Out, remove `YES` from the opt-in keywords. Relay uses YES to approve actions.
- STOP is recorded on the user and Twilio sends the standard confirmation. HELP is answered by Relay with `SUPPORT_EMAIL`.

### Google

Create an OAuth client (web application) with the Gmail and Calendar APIs enabled and register `{PUBLIC_API_URL}/oauth/google/callback` as the redirect URI. Scopes requested: `gmail.readonly`, `gmail.send`, `calendar.events`, `openid`, `email`. Unverified apps are capped at 100 test users.

## Environment variables

| Name | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | yes | Local Postgres, or Railway `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | yes | Local Redis, or Railway `${{Redis.REDIS_URL}}` |
| `PUBLIC_API_URL` | yes | ngrok URL locally, Railway api domain in prod |
| `PUBLIC_WEB_URL` | yes | Web app origin: SMS links, CORS, OAuth return to `/account` |
| `API_PORT` / `PORT` | no | Defaults to 4000; Railway sets `PORT` |
| `LOG_LEVEL` | no | pino level, default `info` |
| `TOKEN_ENCRYPTION_KEY` | yes | `openssl rand -base64 32` |
| `JWT_SECRET` | yes | `openssl rand -base64 48` |
| `SUPPORT_EMAIL`, `LEGAL_ENTITY` | yes | Shown in HELP replies and on `/privacy` and `/terms`. Required for 10DLC |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | yes | Twilio console |
| `TWILIO_PHONE_NUMBER` | yes | Number you buy in Twilio (voice + SMS capable) |
| `TWILIO_MESSAGING_SERVICE_SID` | yes | Messaging Service linked to the 10DLC campaign |
| `TWILIO_VERIFY_SERVICE_SID` | yes | Twilio Verify service |
| `VOICE_TTS_PROVIDER`, `VOICE_NAME` | no | ConversationRelay voice; Twilio's default otherwise |
| `ANTHROPIC_API_KEY` | yes | console.anthropic.com |
| `OPENAI_API_KEY` | for `@gpt` | platform.openai.com |
| `PERPLEXITY_API_KEY` | for `@web` and web search | Perplexity API settings |
| `DEFAULT_MODEL` | no | `claude` \| `gpt` \| `perplexity` for new users |
| `CLAUDE_MODEL`, `CLAUDE_FAST_MODEL`, `OPENAI_MODEL`, `OPENAI_FAST_MODEL`, `PERPLEXITY_MODEL` | yes | Current model IDs. `*_FAST_MODEL` runs phone calls |
| `CLAUDE_PRICE`, `CLAUDE_FAST_PRICE`, `OPENAI_PRICE`, `OPENAI_FAST_PRICE`, `PERPLEXITY_PRICE` | yes | `input/output` USD per million tokens, for the spend cap. Unset falls back to 15/75 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for email/calendar | Google Cloud console |
| `GOOGLE_REDIRECT_URI` | no | Defaults to `{PUBLIC_API_URL}/oauth/google/callback` |
| `DAILY_SPEND_CAP_CENTS` | no | Per-user daily model spend cap, default 300 |
| `INVITE_ONLY` | no | Default `true`; signup needs an invite code |
| `DEV_LOGIN_CODE` | no | Development only; bypasses Twilio Verify |
| `NEXT_PUBLIC_API_URL` | yes | API URL for the web app |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_RELAY_NUMBER` | yes | API URL and Relay number for the mobile app |
| `TEST_DATABASE_URL`, `TEST_REDIS_URL` | tests | Separate DB for DB-backed tests; Redis defaults to db 1 |

## Project structure

```
apps/api            Fastify: /twilio/sms, /twilio/voice, /voice/ws, /twilio/call-status, /oauth/google, /v1
apps/worker         BullMQ workers: agent turns, approved actions, reminders
apps/web            Next.js: landing, waitlist, /privacy, /terms, /account
apps/mobile         Expo: sign-up, setup, approvals, activity, settings
packages/agent      router (@claude/@gpt/@web), agent loop, tools, approval gate, prompts
packages/providers  one adapter per model provider, pricing
packages/core       env, Twilio, queues, conversations, Google OAuth, crypto, PIN checks, spend
packages/db         Prisma schema, migrations, client
packages/types      shared types and API shapes
packages/config     shared tsconfig
```

## How it works

- **Texts.** The webhook validates the Twilio signature, handles STOP/START/HELP, stores the message, and queues a turn. The worker waits 1.2 seconds so a burst of texts gets one answer, runs the agent, and replies through the Messaging Service.
- **Routing.** `@claude`, `@gpt`, `@web` pick the model per message. On calls, "ask GPT…" works the same way.
- **Approvals.** `gmail_send`, calendar invites to other people, and `place_call` never run directly. They become `Action` rows the user approves by texting YES (plus PIN for high-risk ones) or in the app. The text shown is built from the validated input, never from model prose. Once Relay reads email, calendar, or web content in a turn, every write after it needs approval too.
- **Calls.** ConversationRelay does speech-to-text and text-to-speech; `/voice/ws` streams the same agent on the fast model. Caller ID alone isn't trusted: without STIR/SHAKEN A attestation or a PIN typed on the keypad, the call gets no email, calendar, or memory access, and anything sensitive goes out by text.
- **Calls for you.** `place_call` dials a business from the Relay number, says it's an automated assistant and that the call is transcribed, stays inside the approved brief, and texts the result.
- **Limits.** 30 texts per 10 minutes, 12 calls an hour, 5 outbound calls a day, and `DAILY_SPEND_CAP_CENTS` of model spend per day.

## Testing

```bash
createdb relay_test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/relay_test pnpm --filter @relay/db db:deploy
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/relay_test pnpm test
```

Without `TEST_DATABASE_URL`, DB-backed suites skip and unit tests still run.

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

- Every Twilio webhook and the ConversationRelay WebSocket validate `X-Twilio-Signature`. No exceptions, including local dev.
- STOP / HELP / START are handled before any text reaches the agent.
- Any tool that sends, spends, or contacts a third party creates an `Action` in `AWAITING_CONFIRMATION` and waits for YES. Tool calls after untrusted content always confirm.
- Voice never trusts caller ID alone for sensitive actions. PIN required. PIN speech is never stored or sent to a model.
- OAuth tokens are stored encrypted (`TOKEN_ENCRYPTION_KEY`) and never logged.
- Model IDs and prices live in env, not code.
- New model provider = one file in `packages/providers` implementing `ModelProvider`.
- New tool = one `defineTool` in `packages/agent/src/tools`, registered in `tools/index.ts`. Set `kind` honestly: `external` always needs approval.
- Packages build to `dist/`; apps import them by workspace name. ESM throughout, `.js` extensions in relative imports.
- Stubs return `501` with a `TODO` naming what they need. No mock data.
- `bootstrap.sh` created the scaffold and now refuses to run over it.
