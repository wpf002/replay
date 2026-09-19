# Relay — Architecture

Text or call one phone number. Relay routes you to Claude, GPT, or Perplexity, remembers context, and takes actions on your accounts (email, calendar, reminders, errands). Same idea as Instinct: no new interface to learn. The phone app exists for setup and control, not for chatting.

## How a message flows

```
 SMS  ──> Twilio ──webhook──> apps/api ──enqueue──> Redis (BullMQ) ──> apps/worker
                                                                        │
                                                            agent loop (packages/agent)
                                                            ├─ model: Claude / GPT / Perplexity
                                                            ├─ tools: gmail, calendar, reminders, web, ...
                                                            └─ writes Message + Action rows (Postgres)
                                                                        │
 SMS  <── Twilio <──────────── REST send ───────────────────────────────┘

 Call ──> Twilio ConversationRelay (Twilio does STT + TTS)
            └─ WebSocket (text in, text out) <──> apps/api /voice/ws ──> same agent, streaming
```

SMS is async: the webhook returns an empty TwiML 200 immediately, and the worker replies when done. That keeps you under Twilio's 15s webhook timeout even when the agent is chaining tools.

Voice is sync and latency-bound. ConversationRelay hands us transcribed text over a WebSocket and speaks whatever text we stream back, so any model can be the brain. Use a fast model on calls (Claude Haiku or GPT mini tier), stream tokens, and push slow tool work (sending an email, searching) into "I'm on it, I'll text you when it's done" plus a background job.

## Model routing

The user never picks a model in an app. They either say it or get the default.

| Text starts with | Goes to |
|---|---|
| `@claude` | Claude |
| `@gpt` | OpenAI |
| `@web` / `@perplexity` | Perplexity Sonar (cited, live web) |
| nothing | the user's default brain (Claude out of the box) |

The default brain is an agent with tools. Perplexity is also exposed to it as a `web_search` tool, so "what time does Home Depot close" works without a prefix. Every provider sits behind one adapter interface in `packages/providers` so swapping or adding models is one file.

Reality check: this runs on your API keys, not users' ChatGPT Plus or Claude Pro subscriptions. There's no sanctioned way to pipe SMS into a consumer subscription. Model cost is yours, which is what the subscription price pays for.

## Actions (v1)

| Action | How | Guardrail |
|---|---|---|
| Read/summarize email | Gmail API | none |
| Draft + send email | Gmail API | text-back confirm ("Send? YES") |
| Calendar read/create | Google Calendar API | confirm on invites to others |
| Reminders / scheduled texts | BullMQ delayed jobs | none |
| Web answers | Perplexity Sonar | none |
| Memory ("my wife's name is…") | `Memory` table, injected into context | user can text "forget …" |

### v2 errands, and how they actually get done

| Errand | Path |
|---|---|
| Restaurant booking | OpenTable/Resy don't offer an open booking API. Two options: an outbound voice agent that calls the restaurant (Twilio outbound + same voice stack), or a headless browser agent. The phone-call route is more reliable and is a good demo. |
| Groceries | Instacart Developer Platform builds a cart/shopping-list link; user taps to check out. |
| Bills | Parse bills out of email, remind, deep-link to pay. Don't move money in v1. Real payments later means Stripe Issuing single-use cards with hard limits, plus the compliance that comes with it. |
| Cancel subscriptions | Browser agent or outbound call. Always confirm first. |

Anything that spends money, sends on the user's behalf, or contacts a third party goes through an `Action` row with `status = AWAITING_CONFIRMATION` and a text asking for YES. No exceptions.

## The phone app (apps/mobile, Expo)

Does five things:

1. Sign up, verify phone number (Twilio Verify), collect SMS opt-in consent (needed for 10DLC).
2. Connect accounts via OAuth (Google first).
3. Pick default brain, set a PIN for sensitive actions, timezone.
4. See history and pending approvals; approve/deny with a tap as an alternative to texting YES.
5. Billing.

Also adds the Relay number to contacts so it shows up as "Relay" in Messages.

## Security

- Validate `X-Twilio-Signature` on every webhook. Reject anything unsigned.
- Caller ID is not authentication. A phone number is spoofable on voice and vulnerable to SIM swap. Sensitive actions over voice require the PIN; over SMS require confirmation plus PIN above a risk threshold.
- OAuth refresh tokens encrypted at rest (AES-256-GCM, key from env / KMS), never logged.
- Prompt injection: email bodies and web pages are untrusted input. Tool calls triggered while processing untrusted content always require user confirmation, and the confirmation text shows exactly what will happen ("Send email to x@y.com: '…'").
- Per-user rate limits and a daily spend cap on model usage.

## Compliance you can't skip

- **A2P 10DLC.** US SMS from a 10-digit number requires brand + campaign registration through Twilio. Since June 30, 2026 the campaign registration requires privacy policy and terms URLs, so the web app ships those pages first. Plan on days to weeks for approval. Toll-free verification is the alternative path.
- **STOP / HELP / START** keywords handled before anything reaches the agent.
- **Google OAuth verification.** Gmail read/send are restricted scopes. Unverified apps are capped at 100 test users; going public needs Google's verification and a third-party security assessment (CASA). Start this early.
- **iMessage.** Twilio can't send blue bubbles. If that matters, Sendblue or LoopMessage provide iMessage lines. Keep the channel layer abstract so it's a new adapter, not a rewrite.

## Data model (first cut)

- `User` — phone (E.164, unique), name, timezone, defaultModel, pinHash, smsOptInAt
- `Connection` — user, provider (GOOGLE), scopes, encrypted tokens, expiry
- `Conversation` — user, channel (SMS/VOICE), started/ended
- `Message` — conversation, direction, role, model, content, twilioSid
- `Action` — user, type, status, payload, result, requiresConfirmation, confirmedAt
- `Memory` — user, fact, source message
- `Reminder` — user, runAt, body, jobId

## Repo layout

```
apps/api       Fastify: Twilio SMS + voice webhooks, voice WebSocket, OAuth callbacks, mobile API
apps/worker    BullMQ worker: runs the agent loop and sends replies
apps/web       Next.js: landing, waitlist, privacy/terms (needed for 10DLC), account pages
apps/mobile    Expo: onboarding, connections, approvals, settings
packages/agent     agent loop, router, tool registry
packages/providers Claude / OpenAI / Perplexity adapters behind one interface
packages/db        Prisma schema + client
packages/types     shared types
packages/config    tsconfig, eslint, prettier
```

## Build order

1. Web: privacy + terms pages live on a domain. Submit 10DLC brand/campaign the same day, since it's the long pole.
2. SMS round trip: webhook → worker → Claude → reply. Prefix routing to GPT and Perplexity.
3. Conversation history + memory.
4. Google OAuth from the mobile app; Gmail + Calendar tools with confirmation flow.
5. Reminders.
6. Voice via ConversationRelay, same agent, fast model, PIN gate.
7. Outbound calling agent for bookings.
8. Billing, spend caps, invite codes.
