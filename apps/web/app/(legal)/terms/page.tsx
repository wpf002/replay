import { SMS_CONSENT_TEXT } from "@relay/types";
import type { Metadata } from "next";
import Link from "next/link";
import { site } from "../../../lib/site";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "Terms of Service" };

const SECTIONS = [
  { id: "service", label: "The service" },
  { id: "account", label: "Your account" },
  { id: "sms", label: "SMS terms" },
  { id: "calls", label: "Calls" },
  { id: "actions", label: "Actions" },
  { id: "ai", label: "AI output" },
  { id: "use", label: "Acceptable use" },
  { id: "liability", label: "Liability" },
];

export default function Terms() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className={styles.updated}>Last updated {site.legalUpdated}</p>

      <nav aria-label="Sections">
        <ul className={styles.toc}>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <p>
        These terms are an agreement between you and {site.legalEntity} (&quot;Relay,&quot;
        &quot;we,&quot; &quot;us&quot;) covering the Relay service, the Relay mobile app, and this
        website. By creating an account or texting or calling Relay, you agree to them and to our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2 id="service">The service</h2>
      <p>
        Relay is an assistant you reach by text message and phone call. It answers with AI models
        from Anthropic, OpenAI, and Perplexity, and, if you connect your accounts, it can read and
        send email, manage your calendar, set reminders, and place calls for you. Relay is in an
        invite-only beta. Features may change, and the service may be unavailable at times.
      </p>
      <p>
        Relay is free during the beta. We&apos;ll tell you before any charges apply, and you can
        decline and close your account.
      </p>

      <h2 id="account">Your account</h2>
      <ul>
        <li>You must be 18 or older and have a mobile number you control.</li>
        <li>
          Anyone with your phone can text Relay as you. Keep your phone locked, set a PIN in the
          app, and tell us right away if your number is lost, stolen, or ported without your
          permission.
        </li>
        <li>You&apos;re responsible for activity on your account.</li>
      </ul>

      <h2 id="sms">SMS terms</h2>
      <div className={styles.callout}>
        <ul>
          <li>
            <strong>Program.</strong> Relay, an AI assistant you reach by text. Messages include
            replies to your texts, reminders you set, confirmation requests for actions, and account
            notices such as sign-in codes.
          </li>
          <li>
            <strong>Opt-in.</strong> You opt in when you sign up in the Relay app or on this
            website by checking a box next to this statement: &quot;{SMS_CONSENT_TEXT}&quot;
          </li>
          <li>
            <strong>Frequency.</strong> Message frequency varies with how you use Relay.
          </li>
          <li>
            <strong>Cost.</strong> Message and data rates may apply.
          </li>
          <li>
            <strong>Help.</strong> Reply HELP for help, or email{" "}
            <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
          </li>
          <li>
            <strong>Opt-out.</strong> Reply STOP to cancel. You&apos;ll get one message confirming
            you&apos;ve unsubscribed and no further texts. Reply START to resume.
          </li>
          <li>Carriers are not liable for delayed or undelivered messages.</li>
        </ul>
      </div>

      <h2 id="calls">Calls</h2>
      <p>
        When you call Relay, your speech is converted to text so Relay can respond, and the
        transcript is saved to your history. When you ask Relay to call a business for you, Relay
        identifies itself as an automated assistant calling on your behalf, and the call is
        transcribed. Only ask Relay to call businesses you&apos;re allowed to contact, for lawful
        purposes. Relay can&apos;t call emergency services. In an emergency, call 911.
      </p>

      <h2 id="actions">Actions on your behalf</h2>
      <p>
        Before Relay sends an email, invites someone to an event, or places a call, it shows you
        exactly what it will do and waits for your approval. When you approve, you authorize Relay
        to act for you and you&apos;re responsible for that action and its content. Relay may
        decline requests that look unsafe, unlawful, or abusive.
      </p>

      <h2 id="ai">AI output</h2>
      <p>
        Relay&apos;s answers come from AI models and can be wrong, incomplete, or out of date. Check
        anything important. Don&apos;t rely on Relay for medical, legal, financial, or safety
        decisions.
      </p>

      <h2 id="use">Acceptable use</h2>
      <p>Don&apos;t use Relay to:</p>
      <ul>
        <li>break the law or help someone else break it;</li>
        <li>harass, threaten, impersonate, or spam anyone, including by calls placed through Relay;</li>
        <li>send content you don&apos;t have the right to send;</li>
        <li>probe, overload, or get around Relay&apos;s limits and safeguards.</li>
      </ul>
      <p>We may suspend or close accounts that violate these terms.</p>

      <h2 id="third-parties">Third-party services</h2>
      <p>
        Relay depends on services from Twilio, Google, Anthropic, OpenAI, and Perplexity. Your use
        of a connected account, such as Gmail, stays subject to that provider&apos;s terms. We
        aren&apos;t responsible for outages or changes on their side.
      </p>

      <h2 id="ending">Ending your account</h2>
      <p>
        You can delete your account in the app at any time. We may suspend or end access if you
        break these terms or if we shut the service down, and we&apos;ll give notice when we
        reasonably can.
      </p>

      <h2 id="liability">Disclaimers and liability</h2>
      <p>
        Relay is provided &quot;as is&quot; without warranties of any kind, to the extent the law
        allows. To the extent the law allows, {site.legalEntity} isn&apos;t liable for indirect,
        incidental, or consequential damages, and our total liability for any claim is limited to
        the greater of the amount you paid us in the 12 months before the claim or $50.
      </p>

      <h2 id="changes">Changes</h2>
      <p>
        When we change these terms, we update the date at the top. If a change is material,
        we&apos;ll tell you by text or in the app before it takes effect. Continuing to use Relay
        after that means you accept the new terms.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions about these terms go to{" "}
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>
    </>
  );
}
