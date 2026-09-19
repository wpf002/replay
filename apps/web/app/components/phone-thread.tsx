import { LogoMark } from "./logo";
import styles from "./phone-thread.module.css";

export interface ThreadMessage {
  from: "me" | "relay";
  text: string;
  note?: string;
}

/** An SMS thread with Relay, drawn to match what the product actually sends. */
export function PhoneThread({
  messages,
  label = "Text Message",
  footnote,
}: {
  messages: ThreadMessage[];
  label?: string;
  footnote?: string;
}) {
  return (
    <figure className={styles.phone} aria-label="Example text conversation with Relay">
      <div className={styles.head}>
        <LogoMark size={40} />
        <div>
          <div className={styles.name}>Relay</div>
          <div className={styles.meta}>{label}</div>
        </div>
      </div>
      <ol className={styles.thread}>
        {messages.map((m, i) => (
          <li
            key={i}
            className={`${styles.row} ${m.from === "me" ? styles.me : styles.relay}`}
            style={{ "--i": i } as React.CSSProperties}
          >
            <span className="sr-only">{m.from === "me" ? "You: " : "Relay: "}</span>
            <p className={styles.bubble}>{m.text}</p>
            {m.note ? <span className={styles.note}>{m.note}</span> : null}
          </li>
        ))}
      </ol>
      {footnote ? <figcaption className={styles.footnote}>{footnote}</figcaption> : null}
    </figure>
  );
}
