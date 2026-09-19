import type { Metadata } from "next";
import Link from "next/link";
import { site } from "../../../lib/site";
import styles from "../legal.module.css";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className={styles.updated}>Last updated {site.legalUpdated}</p>

      <div className={styles.summary}>
        <p>
          <strong>The short version.</strong>
        </p>
        <ul>
          <li>We use your phone number, messages, and connected accounts to run Relay for you.</li>
          <li>
            We never sell your data, and we never share your phone number or SMS consent with third
            parties for marketing.
          </li>
          <li>You can delete your account and everything in it from the app at any time.</li>
        </ul>
      </div>

      <p>
        This policy explains what {site.legalEntity} (&quot;Relay,&quot; &quot;we,&quot;
        &quot;us&quot;) collects when you use the Relay service, the Relay mobile app, and this
        website, how we use it, and the choices you have.
      </p>

      <h2 id="collect">What we collect</h2>
      <ul>
        <li>
          <strong>Account details.</strong> Your mobile number, the name you give us, your time zone,
          your model preference, a hashed copy of your PIN if you set one, and the date and method
          of your SMS consent.
        </li>
        <li>
          <strong>Conversations.</strong> Texts you send to Relay and its replies. When you call
          Relay, our telephony provider converts speech to text and we store the transcript. We
          don&apos;t store call audio.
        </li>
        <li>
          <strong>Things you ask Relay to keep.</strong> Facts you ask it to remember, reminders you
          set, and actions you approve or deny, along with their results.
        </li>
        <li>
          <strong>Connected Google data.</strong> If you connect Google, we store encrypted OAuth
          tokens and the account email. Relay reads Gmail messages and Calendar events only when a
          request of yours needs them. Content it reads can appear in Relay&apos;s replies and in
          your conversation history.
        </li>
        <li>
          <strong>Usage and technical data.</strong> Model usage counts used to enforce daily
          limits, IP addresses and request logs kept for security, and basic device information from
          the app.
        </li>
        <li>
          <strong>Waitlist.</strong> The email address you enter to join the waitlist.
        </li>
      </ul>

      <h2 id="use">How we use it</h2>
      <ul>
        <li>To answer your messages and calls and to carry out actions you approve.</li>
        <li>To send the texts you asked for: replies, reminders, and confirmation requests.</li>
        <li>To verify your phone number, secure your account, and prevent abuse.</li>
        <li>To enforce usage limits and keep the service running.</li>
        <li>To email you about the waitlist, if you joined it.</li>
      </ul>
      <p>We don&apos;t sell personal information, and we don&apos;t use it for advertising.</p>

      <h2 id="sharing">Who we share it with</h2>
      <p>We share data only with service providers that run parts of Relay for us:</p>
      <ul>
        <li>
          <strong>Twilio</strong> delivers texts and calls, converts speech to text and text to
          speech, and sends verification codes.
        </li>
        <li>
          <strong>Anthropic, OpenAI, and Perplexity</strong> generate responses. We send the message
          and the context needed to answer it. Each processes that data under its API terms and
          privacy policy.
        </li>
        <li>
          <strong>Google</strong> receives requests for your Gmail and Calendar data when you&apos;ve
          connected them and a request needs them.
        </li>
        <li>
          <strong>Cloud hosting providers</strong> store our databases and run our servers.
        </li>
      </ul>
      <p>
        We may also disclose information when the law requires it, to protect someone&apos;s safety,
        or as part of a merger or acquisition, in which case this policy continues to apply.
      </p>

      <h2 id="sms">Text messaging</h2>
      <div className={styles.callout}>
        <p>
          No mobile information will be shared with third parties or affiliates for marketing or
          promotional purposes. All the above categories exclude text messaging originator opt-in
          data and consent; this information will not be shared with any third parties.
        </p>
      </div>
      <p>
        You can opt out of texts at any time by replying STOP. See the{" "}
        <Link href="/terms#sms">SMS terms</Link> for details.
      </p>

      <h2 id="google">Google user data</h2>
      <p>
        Relay&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. We use Gmail and Calendar data only to provide
        the features you request. We don&apos;t use it for advertising, we don&apos;t sell it, and
        people at Relay don&apos;t read it unless you ask us to for support, it&apos;s needed for
        security, or the law requires it. You can disconnect Google in the app, which deletes our
        stored tokens and revokes Relay&apos;s access.
      </p>

      <h2 id="security">Security</h2>
      <p>
        Data travels over TLS. OAuth tokens are encrypted at rest with AES-256-GCM and are never
        written to logs. PINs are stored as salted hashes. Actions that send, spend, or contact
        someone require your confirmation.
      </p>

      <h2 id="retention">Retention and deletion</h2>
      <p>
        We keep your data while your account is open. When you delete your account in the app, we
        delete your conversations, memories, reminders, actions, and connected-account tokens right
        away, and remove remaining copies from backups within 30 days. Waitlist emails are deleted
        when you ask or once you&apos;ve received an invite and signed up.
      </p>

      <h2 id="rights">Your choices and rights</h2>
      <ul>
        <li>Text STOP to stop all texts from Relay.</li>
        <li>Text &quot;forget&quot; followed by a fact to delete a memory, or delete it in the app.</li>
        <li>Disconnect Google or delete your account in the app.</li>
        <li>
          Email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> to request a copy of
          your data or ask us to correct or delete it. Depending on where you live, you may have
          additional rights under local law, and we honor them.
        </li>
      </ul>

      <h2 id="children">Children</h2>
      <p>Relay is for people 18 and older. We don&apos;t knowingly collect data from children.</p>

      <h2 id="changes">Changes</h2>
      <p>
        When we change this policy, we update the date at the top. If a change is material, we&apos;ll
        tell you by text or in the app before it takes effect.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        Questions about privacy go to{" "}
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
      </p>
    </>
  );
}
