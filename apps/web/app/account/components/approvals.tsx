"use client";

import type { ActionDTO } from "@relay/types";
import { useState, useTransition } from "react";
import { approveAction, denyAction } from "../actions";
import styles from "../account.module.css";

const LABELS: Record<string, string> = {
  gmail_send: "Send email",
  calendar_create: "Add to calendar",
  place_call: "Call a business",
  remember: "Save to memory",
  forget: "Forget",
  set_reminder: "Set a reminder",
  cancel_reminder: "Cancel a reminder",
};

function minutesLeft(iso: string | null): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  return min ? ` · expires in ${min} min` : " · expiring";
}

function Approval({ action }: { action: ActionDTO }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? "Something went wrong."));
    });

  return (
    <li className={styles.approval}>
      <div className={styles.approvalHead}>
        <strong>{LABELS[action.type] ?? action.type}</strong>
        <span className={styles.meta}>
          From a {action.channel === "voice" ? "call" : "text"}
          {minutesLeft(action.expiresAt)}
        </span>
      </div>
      <pre className={styles.summary}>{action.summary}</pre>
      {action.tainted ? (
        <p className={styles.meta}>Relay prepared this after reading email or web content. Check it carefully.</p>
      ) : null}
      <div className={styles.approvalActions}>
        {action.requiresPin ? (
          <input
            className={`input ${styles.pinInput}`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN"
            aria-label="Your PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          />
        ) : null}
        <button className="btn btn-sm" disabled={pending} onClick={() => run(() => denyAction(action.id))}>
          Skip
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={pending || (action.requiresPin && pin.length < 4)}
          onClick={() => run(() => approveAction(action.id, action.requiresPin ? pin : undefined))}
        >
          {pending ? <span className="spinner" aria-hidden="true" /> : null}
          Approve
        </button>
      </div>
      {error ? (
        <p className="error-text" aria-live="polite">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function Approvals({ actions }: { actions: ActionDTO[] }) {
  if (!actions.length) {
    return (
      <div className={styles.empty}>
        <strong>Nothing waiting</strong>
        <p className="muted">When Relay drafts an email, an invite, or a call for you, it shows up here to approve.</p>
      </div>
    );
  }
  return (
    <ul className={styles.approvals}>
      {actions.map((a) => (
        <Approval key={a.id} action={a} />
      ))}
    </ul>
  );
}
