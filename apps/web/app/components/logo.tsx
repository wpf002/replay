import styles from "./logo.module.css";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className={styles.mark} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect className={styles.tile} width="32" height="32" rx="8" />
      <path
        className={styles.bubble}
        d="M8 11a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6.2l-4.3 3.4c-.6.5-1.5 0-1.5-.8V21A3 3 0 0 1 8 18z"
      />
      <path className={styles.line} d="M12.5 12.5h7M12.5 16.5h4.5" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className={styles.logo}>
      <LogoMark />
      <span className={styles.word}>Relay</span>
    </span>
  );
}
