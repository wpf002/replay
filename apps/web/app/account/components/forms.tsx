"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteAccount, setPin, type Result } from "../actions";
import styles from "../account.module.css";

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [current, setCurrent] = useState("");
  const [pin, setPinValue] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);

  return (
    <form
      className={styles.inline}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setPin(pin, hasPin ? current : undefined);
          setMessage(res.ok ? { ok: true, text: "PIN saved." } : { ok: false, text: res.error });
          if (res.ok) {
            setPinValue("");
            setCurrent("");
          }
        });
      }}
    >
      {hasPin ? (
        <input
          className="input"
          type="password"
          inputMode="numeric"
          placeholder="Current PIN"
          aria-label="Current PIN"
          value={current}
          onChange={(e) => setCurrent(digits(e.target.value))}
        />
      ) : null}
      <input
        className="input"
        type="password"
        inputMode="numeric"
        placeholder={hasPin ? "New PIN" : "4 to 8 digits"}
        aria-label={hasPin ? "New PIN" : "PIN"}
        value={pin}
        onChange={(e) => setPinValue(digits(e.target.value))}
      />
      <button className="btn btn-sm" disabled={pin.length < 4 || (hasPin && current.length < 4) || pending}>
        {hasPin ? "Change PIN" : "Set PIN"}
      </button>
      {message ? (
        <p className={message.ok ? styles.okText : "error-text"} aria-live="polite">
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

const initial: Result = { ok: true, data: null };

export function DeleteAccount() {
  const [state, action, pending] = useActionState((_: Result, form: FormData) => deleteAccount(form), initial);
  return (
    <form action={action} className={styles.inline}>
      <input className="input" name="confirm" placeholder="Type DELETE" aria-label="Type DELETE to confirm" autoComplete="off" />
      <button className="btn btn-danger btn-sm" disabled={pending}>
        Delete account
      </button>
      {!state.ok ? (
        <p className="error-text" aria-live="polite">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
