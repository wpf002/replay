"use client";

import { useActionState, useId } from "react";
import { joinWaitlist, type WaitlistState } from "../actions/waitlist";
import { CheckIcon } from "./icons";
import styles from "./waitlist-form.module.css";

const initial: WaitlistState = { status: "idle" };

export function WaitlistForm({ source, align = "start" }: { source: string; align?: "start" | "center" }) {
  const [state, action, pending] = useActionState(joinWaitlist, initial);
  const id = useId();
  const errorId = `${id}-error`;

  if (state.status === "success") {
    return (
      <div className={`${styles.success} ${align === "center" ? styles.center : ""}`} role="status">
        <span className={styles.check}>
          <CheckIcon size={16} />
        </span>
        <p>
          You&apos;re on the list. We&apos;ll email <strong>{state.email}</strong> when a spot opens.
        </p>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : null;

  return (
    <form action={action} className={`${styles.form} ${align === "center" ? styles.center : ""}`} noValidate>
      <input type="hidden" name="source" value={source} />
      <div className={styles.row}>
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          required
          className="input"
          defaultValue={state.status === "error" ? state.email : ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={pending}
        />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Joining
            </>
          ) : (
            "Join the waitlist"
          )}
        </button>
      </div>
      <p id={errorId} className={styles.message} aria-live="polite">
        {error ? <span className="error-text">{error}</span> : null}
      </p>
    </form>
  );
}
