import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import styles from "./legal.module.css";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.page}`}>
        <article className={styles.prose}>{children}</article>
      </main>
      <SiteFooter />
    </>
  );
}
