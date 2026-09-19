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

Needs Node 22.12+, pnpm 10 (`corepack enable`), Postgres, Redis, and `cloudflared` for a public URL (`brew install cloudflared`).

```bash
git clone https://github.com/wpf002/replay.git && cd replay
pnpm install
docker run -d --name relay-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=relay postgres:17
docker run -d --name relay-redis -p 6379:6379 redis:7
pnpm configure                  # walks through every key, writes .env
pnpm db:migrate
pnpm --filter @relay/api invite:create -- --count 3 --uses 1   # prints invite codes
pnpm dev                        # api :4000, web :3000, worker, expo
pnpm tunnel                     # separate terminal: public URL + Twilio webhooks
```

Without Twilio Verify, set `DEV_LOGIN_CODE=424242` in `.env` and use that code to sign in. The API refuses to start with it set when `NODE_ENV=production`, and `pnpm tunnel` refuses to open a public URL while it's set.

### Keys (`pnpm configure`)

The wizard opens each provider's key page, takes the key as hidden input, checks it against the live API, and writes `.env`. Keys never leave your machine except to the provider.

| Command | Does |
|---|---|
| `pnpm configure` | Every missing step, in order |
| `pnpm configure <step>` | One step: `claude`, `gpt`, `perplexity`, `url`, `twilio`, `google`, `support` |
| `pnpm configure --check` | Checks every key, sends each configured model a one-line test, checks Twilio webhooks and the Google client |
| `pnpm configure twilio-sync` | Points Twilio at the current `PUBLIC_API_URL` |
| `pnpm tunnel` | Opens a Cloudflare quick tunnel, saves its URL, and updates Twilio's webhooks |

- **Models.** Lists the models your key can use, test-sends the ones you pick, and fills in prices.
- **Twilio.** Picks or buys a number (shows the price and asks first), creates the Verify service and the "Relay" Messaging Service, and sets the webhooks.
- **Google.** Opens the console pages, then checks the client ID, redirect URI, and secret with Google. `http://localhost:4000/oauth/google/callback` works for development.

### Relay's browser

Relay does things on websites in its own browser: books flights and tables, orders groceries, fills out forms. Text it ("order my usual from Instacart") and the agent calls `use_computer`. The worker runs Chrome through Playwright and Claude drives it with Anthropic's browser toolset (`browser_toolset_20260801`, page outline plus screenshots).

- **Approvals.** Before anything that spends, books, sends, or submits, the model calls `request_approval`. That creates an Action like any other: YES by text, with the PIN for purchases if one is set, or approve in the app. The domain in the prompt comes from the browser, not the model.
- **Only the person signs in.** Passwords, one-time codes, CAPTCHAs, and card numbers go through `hand_off`: the person gets a text, opens the live view in the app, taps and types on Relay's browser, and taps Done. Their input goes straight to the page and is never stored or logged. Settings has "Sign in to a site" to do it ahead of time.
- **Questions.** `ask_user` texts a question; the person's next text is routed to the task instead of the agent. Texting "cancel" stops it.
- **Profiles.** Each person has a Chrome profile under `BROWSER_PROFILE_DIR`, so sign-ins stick. Deleting the account or "Sign out of all sites" deletes it.
- **Network.** The browser refuses localhost, private ranges, and metadata addresses. In production, also block private networks at the container's network layer, since a public name can resolve to a private address.
- **Limits.** 2 tasks at a time, 25 a day, 80 model requests and 25 active minutes per task, 30 minutes to answer or approve.

### AI accounts

Onboarding starts with "Choose your AI", then offers two ways to connect it.

**Sign in (default).** Relay opens ChatGPT, Claude, or Perplexity in its own browser and the person signs in there, in the live view. After that, a text to Relay is typed into that app: the chat lands in their own history and their own plan answers it.

- Short question → Relay waits for the reply and texts it back.
- Long job ("build me X") → Relay texts the link and a line about what it started, then checks back at 2, 5, 10, 20, 30, and 60 minutes and texts again when it's done.
- "Save it in my ideas folder" → Relay opens that project in the app and starts the chat inside it.
- A sign-in wall, a code, or a bot check pauses the task and hands the browser to the person.

**API key.** The person pastes a key; requests go to the provider's API and bill their API account. Nothing lands in their chat history. Relay checks the key, then stores it AES-256-GCM encrypted.

A signed-in account answers by itself, without Relay's tools, so texts routed to it (its prefix, or everything when it's the default) don't set reminders or read email. Keep Claude on an API key for that.

- The API checks each key with the provider, then sends one tiny request on the model Relay will use, which catches accounts with no credit. Keys are stored AES-256-GCM encrypted and only sent to the provider's official API.
- A person's own key always wins. Otherwise Relay's key answers, up to `DAILY_SPEND_CAP_CENTS`. Usage on their key doesn't count toward the cap.
- If a provider rejects a key mid-conversation, Relay marks it, texts them how to fix it, and falls back to its own key where that model is included.
- `REQUIRE_USER_MODEL_KEYS=true` turns off Relay's keys for people entirely.

Mobile: `pnpm --filter @relay/mobile ios` (or `android`), or scan the Expo QR code. On a physical phone, set `EXPO_PUBLIC_API_URL` to your machine's LAN address or the tunnel URL.

### Twilio

`pnpm configure twilio` and `pnpm tunnel` set these for you.

- Messaging webhook: `POST {PUBLIC_API_URL}/twilio/sms`
- Voice webhook: `POST {PUBLIC_API_URL}/twilio/voice`
- Outbound call status goes to `{PUBLIC_API_URL}/twilio/call-status` automatically.
- In the Messaging Service's Advanced Opt-Out, remove `YES` from the opt-in keywords. Relay uses YES to approve actions.
- STOP is recorded on the user and Twilio sends the standard confirmation. HELP is answered by Relay with `SUPPORT_EMAIL`.

### Google

Create an OAuth client (web application) with the Gmail and Calendar APIs enabled and register `GOOGLE_REDIRECT_URI` (default `{PUBLIC_API_URL}/oauth/google/callback`) as the redirect URI. Scopes requested: `gmail.readonly`, `gmail.send`, `calendar.events`, `openid`, `email`. Unverified apps are capped at 100 test users.

## Environment variables

| Name | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | yes | Local Postgres, or Railway `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | yes | Local Redis, or Railway `${{Redis.REDIS_URL}}` |
| `PUBLIC_API_URL` | yes | `pnpm tunnel` locally, Railway api domain in prod |
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
| `ANTHROPIC_API_KEY` | for included Claude | console.anthropic.com. People can also connect their own |
| `OPENAI_API_KEY` | for included ChatGPT | platform.openai.com |
| `PERPLEXITY_API_KEY` | for included `@web` and web search | console.perplexity.ai |
| `REQUIRE_USER_MODEL_KEYS` | no | `true`: Relay's model keys are never used for people; everyone connects their own |
| `DEFAULT_MODEL` | no | `claude` \| `gpt` \| `perplexity` for new users |
| `CLAUDE_MODEL`, `CLAUDE_FAST_MODEL`, `OPENAI_MODEL`, `OPENAI_FAST_MODEL`, `PERPLEXITY_MODEL` | yes | Current model IDs. `*_FAST_MODEL` runs phone calls |
| `CLAUDE_PRICE`, `CLAUDE_FAST_PRICE`, `OPENAI_PRICE`, `OPENAI_FAST_PRICE`, `PERPLEXITY_PRICE` | yes | `input/output` USD per million tokens, for the spend cap. Unset falls back to 15/75 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for email/calendar | Google Cloud console |
| `GOOGLE_REDIRECT_URI` | no | Defaults to `{PUBLIC_API_URL}/oauth/google/callback` |
| `BROWSER_PROFILE_DIR`, `BROWSER_CHANNEL`, `BROWSER_EXECUTABLE_PATH` | no | Relay's browser. Defaults to installed Chrome and `~/.relay/browser-profiles` |
| `COMPUTER_MODEL`, `COMPUTER_PRICE` | no | Model that drives the browser and its price. Defaults to `CLAUDE_MODEL` / `CLAUDE_PRICE` |
| `DAILY_SPEND_CAP_CENTS` | no | Per-user daily spend on Relay's model keys, default 300. Their own keys aren't capped |
| `INVITE_ONLY` | no | Default `true`; signup needs an invite code |
| `DEV_LOGIN_CODE` | no | Development only; bypasses Twilio Verify |
| `NEXT_PUBLIC_API_URL` | yes | API URL for the web app |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_RELAY_NUMBER` | yes | API URL and Relay number for the mobile app |
| `TEST_DATABASE_URL`, `TEST_REDIS_URL` | tests | Separate DB for DB-backed tests; Redis defaults to db 1 |

## Project structure

```
apps/api            Fastify: /twilio/sms, /twilio/voice, /voice/ws, /twilio/call-status, /oauth/google, /v1
apps/worker         BullMQ workers: agent turns, approved actions, reminders, Relay's browser
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
- **Whose account answers.** A provider they signed in to answers from their own account in Relay's browser. Otherwise their API key, then Relay's key within the daily cap (see AI accounts above).
- **Limits.** 30 texts per 10 minutes, 12 calls an hour, 5 outbound calls a day, and `DAILY_SPEND_CAP_CENTS` of spend on Relay's keys per day.

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
