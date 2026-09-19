import Link from "next/link";
import { site } from "../../lib/site";
import { Logo } from "./logo";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brand}>
          <Logo />
          <p className={styles.small}>
            Relay sends the conversational messages you ask for. Message frequency varies. Msg &amp;
            data rates may apply. Reply HELP for help, STOP to cancel.
          </p>
        </div>
        <nav className={styles.links} aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/terms#sms">SMS terms</Link>
          <a href={`mailto:${site.supportEmail}`}>Contact</a>
        </nav>
      </div>
      <div className={`container ${styles.base}`}>
        <span className={styles.small}>
          © {new Date().getFullYear()} {site.legalEntity}
        </span>
      </div>
    </footer>
  );
}
