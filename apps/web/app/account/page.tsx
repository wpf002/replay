import { AI_PROVIDERS, MODELS, type ActionDTO, type HistoryItemDTO, type MeDTO, type MemoryDTO, type ReminderDTO } from "@relay/types";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { api, ApiError, sessionToken } from "../../lib/session";
import { Logo } from "../components/logo";
import { SiteFooter } from "../components/site-footer";
import {
  cancelReminder,
  connectGoogle,
  deleteMemory,
  disconnectGoogle,
  signOut,
  updateSettings,
} from "./actions";
import styles from "./account.module.css";
import { AiAccounts } from "./components/ai-accounts";
import { Approvals } from "./components/approvals";
import { DeleteAccount, PinForm } from "./components/forms";
import { SignIn } from "./components/sign-in";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

const MODEL_NAMES = AI_PROVIDERS as Record<string, { name: string; prefix: string }>;

const ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

function phone(e164: string | null): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 ?? "");
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (e164 ?? "");
}

function when(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Banner({ google, deleted }: { google?: string | undefined; deleted?: string | undefined }) {
  const text = deleted
    ? "Your account and its data were deleted."
    : google === "connected"
      ? "Google is connected. Relay can now help with Gmail and Calendar."
      : google === "denied"
        ? "Google wasn't connected because access was declined."
        : google === "error"
          ? "Google didn't connect. Try again in a moment."
          : null;
  if (!text) return null;
  return (
    <div className={styles.banner} role="status">
      {text}
    </div>
  );
}

function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <Link href="/" aria-label="Relay home" className={styles.home}>
          <Logo />
        </Link>
        {signedIn ? (
          <form action={signOut}>
            <button className="btn btn-ghost btn-sm">Sign out</button>
          </form>
        ) : null}
      </div>
    </header>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; deleted?: string }>;
}) {
  const params = await searchParams;

  if (!(await sessionToken())) {
    return (
      <>
        <Header signedIn={false} />
        <main className={`container ${styles.page}`}>
          <Banner deleted={params.deleted} />
          <SignIn />
        </main>
        <SiteFooter />
      </>
    );
  }

  let data: [MeDTO, { pending: ActionDTO[]; recent: ActionDTO[] }, { items: MemoryDTO[] }, { items: ReminderDTO[] }, { items: HistoryItemDTO[] }];
  try {
    data = await Promise.all([
      api<MeDTO>("/v1/me"),
      api<{ pending: ActionDTO[]; recent: ActionDTO[] }>("/v1/actions"),
      api<{ items: MemoryDTO[] }>("/v1/memories"),
      api<{ items: ReminderDTO[] }>("/v1/reminders"),
      api<{ items: HistoryItemDTO[] }>("/v1/history?limit=12"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/account/signout");
    throw err;
  }
  const [me, actions, memories, reminders, history] = data;
  const spentPct = Math.min(100, (me.usage.spentCents / Math.max(1, me.usage.capCents)) * 100);
  const zones = ZONES.includes(me.timezone) ? ZONES : [me.timezone, ...ZONES];

  return (
    <>
      <Header signedIn />
      <main className={`container ${styles.page}`}>
        <Banner google={params.google} />
        <div className={styles.hello}>
          <span className="eyebrow">Account</span>
          <h1 className={styles.h1}>Hi{me.name ? `, ${me.name.split(" ")[0]}` : ""}</h1>
          <p className="muted">{phone(me.phone)}</p>
        </div>

        <div className={styles.grid}>
          <div className={styles.column}>
            <section className={styles.section}>
              <h2 className={styles.h2}>
                Needs your OK
                {actions.pending.length ? <span className={styles.count}>{actions.pending.length}</span> : null}
              </h2>
              <Approvals actions={actions.pending} />
            </section>

            <section className={styles.section}>
              <h2 className={styles.h2}>Recent messages</h2>
              {history.items.length ? (
                <ol className={styles.thread}>
                  {[...history.items].reverse().map((m) => (
                    <li key={m.id} className={m.from === "user" ? styles.me : styles.relay}>
                      <p className={styles.bubble}>{m.content}</p>
                      <span className={styles.meta}>
                        {m.channel === "voice" ? "Call · " : ""}
                        {when(m.createdAt, me.timezone)}
                        {m.model ? ` · ${MODEL_NAMES[m.model]?.name ?? m.model}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className={styles.empty}>
                  <strong>No messages yet</strong>
                  <p className="muted">Text {phone(me.relayNumber)} to get started.</p>
                </div>
              )}
            </section>
          </div>

          <div className={styles.column}>
            <section className={`${styles.card} ${styles.line}`}>
              <span className="eyebrow">Your Relay line</span>
              <p className={styles.number}>{phone(me.relayNumber) || "Not configured"}</p>
              {me.relayNumber ? (
                <div className={styles.row}>
                  <a className="btn btn-primary btn-sm" href={`sms:${me.relayNumber}`}>
                    Text
                  </a>
                  <a className="btn btn-sm" href={`tel:${me.relayNumber}`}>
                    Call
                  </a>
                </div>
              ) : null}
            </section>

            <section className={styles.card}>
              <h2 className={styles.h3}>AI accounts</h2>
              <p className="muted">
                Connect the AIs you use with an API key from each provider. Relay encrypts keys and only sends them to
                that provider.
              </p>
              <AiAccounts accounts={me.aiAccounts} included={me.includedModels} />
            </section>

            <section className={styles.card}>
              <h2 className={styles.h3}>Google</h2>
              <p className="muted">
                {me.google.connected
                  ? me.google.missingScopes
                    ? "Connected without Gmail or Calendar permission. Reconnect to allow both."
                    : `Connected as ${me.google.email ?? "your account"}. Gmail and Calendar are available.`
                  : "Connect Gmail and Calendar so Relay can summarize email, draft replies, and add events."}
              </p>
              <form action={me.google.connected && !me.google.missingScopes ? disconnectGoogle : connectGoogle}>
                <button className={me.google.connected && !me.google.missingScopes ? "btn btn-sm" : "btn btn-primary btn-sm"}>
                  {me.google.connected && !me.google.missingScopes ? "Disconnect" : me.google.connected ? "Reconnect Google" : "Connect Google"}
                </button>
              </form>
            </section>

            <section className={styles.card}>
              <h2 className={styles.h3}>Preferences</h2>
              <form action={updateSettings} className={styles.stack}>
                <div className="field">
                  <label className="label" htmlFor="name">
                    Name
                  </label>
                  <input id="name" name="name" className="input" defaultValue={me.name ?? ""} />
                </div>
                <fieldset className={styles.fieldset}>
                  <legend className="label">Default model</legend>
                  {MODELS.map((m) => (
                    <label key={m} className={styles.radio}>
                      <input type="radio" name="defaultModel" value={m} defaultChecked={me.defaultModel === m} />
                      <span>{MODEL_NAMES[m]?.name}</span>
                      <code className={styles.prefix}>{MODEL_NAMES[m]?.prefix}</code>
                    </label>
                  ))}
                </fieldset>
                <div className="field">
                  <label className="label" htmlFor="timezone">
                    Time zone
                  </label>
                  <select id="timezone" name="timezone" className="input" defaultValue={me.timezone}>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-sm">Save preferences</button>
              </form>
            </section>

            <section className={styles.card}>
              <h2 className={styles.h3}>PIN</h2>
              <p className="muted">
                {me.pinLocked
                  ? "Locked for an hour after too many wrong tries."
                  : "Needed on calls before Relay sends anything or opens your email, and for high-risk requests."}
              </p>
              <PinForm hasPin={me.hasPin} />
            </section>

            <section className={styles.card}>
              <h2 className={styles.h3}>Memories</h2>
              {memories.items.length ? (
                <ul className={styles.list}>
                  {memories.items.map((m) => (
                    <li key={m.id}>
                      <span>{m.fact}</span>
                      <form action={deleteMemory.bind(null, m.id)}>
                        <button className="btn btn-ghost btn-sm" aria-label={`Forget ${m.fact}`}>
                          Forget
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Text “remember …” and it shows up here.</p>
              )}
            </section>

            <section className={styles.card}>
              <h2 className={styles.h3}>Reminders</h2>
              {reminders.items.length ? (
                <ul className={styles.list}>
                  {reminders.items.map((r) => (
                    <li key={r.id}>
                      <span>
                        {r.body}
                        <span className={styles.meta}>
                          {when(r.runAt, me.timezone)}
                          {r.recurrence ? ` · repeats ${r.recurrence}` : ""}
                        </span>
                      </span>
                      <form action={cancelReminder.bind(null, r.id)}>
                        <button className="btn btn-ghost btn-sm" aria-label={`Cancel ${r.body}`}>
                          Cancel
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Text “remind me …” to add one.</p>
              )}
            </section>

            <section className={styles.card}>
              <h2 className={styles.h3}>Usage today</h2>
              <div className={styles.usage}>
                <div className={styles.track} role="progressbar" aria-valuenow={Math.round(spentPct)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={styles.fill} style={{ width: `${spentPct}%` }} />
                </div>
                <span className={styles.meta}>
                  ${(me.usage.spentCents / 100).toFixed(2)} of ${(me.usage.capCents / 100).toFixed(2)}
                </span>
              </div>
            </section>

            <section className={`${styles.card} ${styles.danger}`}>
              <h2 className={styles.h3}>Delete account</h2>
              <p className="muted">
                Deletes your messages, memories, reminders, and connected accounts, and revokes Google access.
              </p>
              <DeleteAccount />
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
