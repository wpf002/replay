import Link from "next/link";
import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  EyeIcon,
  GlobeIcon,
  KeypadIcon,
  LockIcon,
  MailIcon,
  MemoryIcon,
  PhoneOutIcon,
  ShieldIcon,
  StopIcon,
} from "./components/icons";
import { PhoneThread, type ThreadMessage } from "./components/phone-thread";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import { WaitlistForm } from "./components/waitlist-form";
import styles from "./home.module.css";

const HERO_THREAD: ThreadMessage[] = [
  { from: "me", text: "remind me to call mom sunday at 5" },
  { from: "relay", text: "Done. I'll text you Sunday at 5:00 PM." },
  { from: "me", text: "email sam that I'm running 10 min late" },
  {
    from: "relay",
    text: "Send to sam@example.com: “Running about 10 minutes late. See you soon.” Reply YES to send or NO to skip.",
  },
  { from: "me", text: "YES" },
  { from: "relay", text: "Sent." },
];

const STEPS = [
  {
    title: "Verify your number",
    body: "Sign up with an invite code. We text you a one-time code to confirm the phone is yours.",
  },
  {
    title: "Connect Google",
    body: "Optional. Gmail and Calendar let Relay read, draft, and schedule for you.",
  },
  {
    title: "Text or call",
    body: "Save Relay as a contact. Text it like a person, or call when your hands are full.",
  },
];

const BRAINS = [
  { prefix: "@claude", name: "Claude", by: "Anthropic", body: "Writing, reasoning, and anything that takes actions. The default for new accounts." },
  { prefix: "@gpt", name: "GPT", by: "OpenAI", body: "A second opinion on the same question, or your default if you prefer it." },
  { prefix: "@web", name: "Sonar", by: "Perplexity", body: "Live web answers with sources, for anything that changed this week." },
  { prefix: null, name: "Your default", by: "Set in the app", body: "It searches the web on its own when a question needs current information." },
];

const ACTIONS = [
  { icon: MailIcon, title: "Email", body: "Summarizes your inbox and drafts replies. Nothing sends until you reply YES." },
  { icon: CalendarIcon, title: "Calendar", body: "Checks your schedule and adds events. Invites to other people wait for your YES." },
  { icon: BellIcon, title: "Reminders", body: "Text “remind me at 5 to call mom” and get a text at 5." },
  { icon: GlobeIcon, title: "Web answers", body: "Current answers with sources from Perplexity. No prefix needed." },
  { icon: MemoryIcon, title: "Memory", body: "Tell it something once and it keeps it. Text “forget” to remove it." },
  { icon: PhoneOutIcon, title: "Calls for you", body: "Relay phones a restaurant to book your table, then texts you how it went.", tag: "Beta" },
];

const GUARANTEES = [
  { icon: CheckIcon, text: "Every email, invite, or call Relay makes for you waits for your approval, by text or in the app." },
  { icon: EyeIcon, text: "The approval shows exactly what goes out, word for word, and who receives it." },
  { icon: KeypadIcon, text: "On calls, sensitive actions need your PIN. Caller ID alone isn't enough." },
  { icon: ShieldIcon, text: "Instructions hidden in emails and web pages can't act on their own. Anything Relay does after reading them asks you first." },
  { icon: LockIcon, text: "Google tokens are encrypted at rest and never written to logs." },
  { icon: StopIcon, text: "Text STOP at any time and Relay stops texting you." },
];

const CALL = [
  { who: "You", text: "Put the dentist on my calendar Tuesday at 3." },
  { who: "Relay", text: "Done. Dentist, Tuesday at 3 PM. Want a reminder the day before?" },
  { who: "You", text: "Yes, at 9." },
  { who: "Relay", text: "Got it. I'll text you Monday at 9 AM." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className={`container ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <span className="eyebrow">Invite-only beta</span>
            <h1 className={styles.display}>Text or call your AI.</h1>
            <p className={styles.lead}>
              Relay is one phone number with Claude, GPT, and Perplexity behind it. It answers
              questions, reads your email, adds to your calendar, sets reminders, and remembers what
              you tell it. You use it from Messages and your phone&apos;s dialer.
            </p>
            <div id="waitlist" className={styles.heroForm}>
              <WaitlistForm source="hero" />
              <p className={styles.fine}>
                Have an invite code? <Link href="/account">Get started</Link>
              </p>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <PhoneThread messages={HERO_THREAD} label="Text Message · Today" />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className={styles.section}>
          <div className="container">
            <header className={styles.sectionHead}>
              <span className="eyebrow">How it works</span>
              <h2 className={styles.h2}>Set it up once, then just text</h2>
            </header>
            <ol className={styles.steps}>
              {STEPS.map((step, i) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
                  <h3 className={styles.h3}>{step.title}</h3>
                  <p className="muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Models */}
        <section id="brains" className={styles.section}>
          <div className={`container ${styles.split}`}>
            <header className={styles.sectionHead}>
              <span className="eyebrow">Models</span>
              <h2 className={styles.h2}>Pick the model per message</h2>
              <p className={styles.sectionLead}>
                Start a text with a prefix to choose who answers. Leave it off and your default
                takes the message.
              </p>
            </header>
            <ul className={styles.brains}>
              {BRAINS.map((b) => (
                <li key={b.name} className={styles.brain}>
                  <span className={b.prefix ? styles.prefix : `${styles.prefix} ${styles.prefixNone}`}>
                    {b.prefix ?? "no prefix"}
                  </span>
                  <div>
                    <div className={styles.brainName}>
                      {b.name} <span className="muted">· {b.by}</span>
                    </div>
                    <p className="muted">{b.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Actions */}
        <section id="actions" className={styles.section}>
          <div className="container">
            <header className={styles.sectionHead}>
              <span className="eyebrow">Actions</span>
              <h2 className={styles.h2}>It runs the errands, too</h2>
            </header>
            <ul className={styles.grid}>
              {ACTIONS.map(({ icon: Icon, title, body, tag }) => (
                <li key={title} className={styles.card}>
                  <span className={styles.cardIcon}>
                    <Icon />
                  </span>
                  <h3 className={styles.h3}>
                    {title}
                    {tag ? <span className={styles.tag}>{tag}</span> : null}
                  </h3>
                  <p className="muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Safety */}
        <section id="safety" className={styles.section}>
          <div className={`container ${styles.split}`}>
            <div className={styles.safetyLeft}>
              <header className={styles.sectionHead}>
                <span className="eyebrow">Safety</span>
                <h2 className={styles.h2}>Nothing goes out without your YES</h2>
                <p className={styles.sectionLead}>
                  Relay can read on its own. Sending, inviting, and calling wait for you.
                </p>
              </header>
              <div className={styles.approval} aria-label="Example approval request in the Relay app">
                <div className={styles.approvalHead}>
                  <span className={styles.cardIcon}>
                    <MailIcon />
                  </span>
                  <div>
                    <div className={styles.brainName}>Send email</div>
                    <div className={styles.meta}>Waiting for you · 1 min ago</div>
                  </div>
                </div>
                <dl className={styles.approvalBody}>
                  <dt>To</dt>
                  <dd>sam@example.com</dd>
                  <dt>Subject</dt>
                  <dd>Running late</dd>
                  <dt>Message</dt>
                  <dd>Running about 10 minutes late. See you soon.</dd>
                </dl>
                <div className={styles.approvalActions} aria-hidden="true">
                  <span className="btn btn-sm">Deny</span>
                  <span className="btn btn-primary btn-sm">Approve</span>
                </div>
              </div>
            </div>
            <ul className={styles.guarantees}>
              {GUARANTEES.map(({ icon: Icon, text }) => (
                <li key={text}>
                  <Icon className={styles.guaranteeIcon} />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Voice */}
        <section id="voice" className={styles.section}>
          <div className={`container ${styles.split}`}>
            <header className={styles.sectionHead}>
              <span className="eyebrow">Voice</span>
              <h2 className={styles.h2}>Call it when typing is a hassle</h2>
              <p className={styles.sectionLead}>
                Same number, same memory. Relay handles quick questions on the call. Longer jobs,
                like a web search or an email that needs your approval, arrive as a text when
                they&apos;re ready.
              </p>
            </header>
            <div className={styles.call} aria-label="Example phone call with Relay">
              <div className={styles.callHead}>
                <span className={styles.brainName}>Relay</span>
                <span className={styles.callTime}>
                  <span className={styles.live} aria-hidden="true" />
                  00:42
                </span>
              </div>
              <div className={styles.wave} aria-hidden="true">
                {Array.from({ length: 28 }, (_, i) => (
                  <span key={i} style={{ "--i": i } as React.CSSProperties} />
                ))}
              </div>
              <dl className={styles.transcript}>
                {CALL.map((line, i) => (
                  <div key={i} className={styles.line}>
                    <dt>{line.who}</dt>
                    <dd>{line.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.cta}>
          <div className={`container ${styles.ctaInner}`}>
            <h2 className={styles.h2}>Get on the list</h2>
            <p className={styles.sectionLead}>
              Relay is invite-only while we test it. Leave your email and we&apos;ll send an invite
              when there&apos;s room.
            </p>
            <WaitlistForm source="footer" align="center" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
