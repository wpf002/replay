import Link from "next/link";
import { Logo } from "./logo";
import styles from "./site-header.module.css";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#brains", label: "Models" },
  { href: "/#actions", label: "Actions" },
  { href: "/#safety", label: "Safety" },
];

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.home} aria-label="Relay home">
          <Logo />
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.link}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.cta}>
          <Link href="/account" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
          <Link href="/#waitlist" className="btn btn-primary btn-sm">
            Join the waitlist
          </Link>
        </div>
      </div>
    </header>
  );
}
