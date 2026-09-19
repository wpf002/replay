"use client";

import { SMS_CONSENT_TEXT } from "@relay/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { completeSignup, startSignIn, verifyCode } from "../actions";
import styles from "../account.module.css";

type Step =
  | { name: "phone" }
  | { name: "code"; phone: string }
  | { name: "signup"; signupToken: string; inviteRequired: boolean };

function formatUs(digits: string): string {
  const d = digits.slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function SignIn() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "phone" });
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    const phone = `+1${digits}`;
    start(async () => {
      const res = await startSignIn(phone);
      if (!res.ok) return setError(res.error);
      setError(null);
      setStep({ name: "code", phone });
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (step.name !== "code") return;
    start(async () => {
      const res = await verifyCode(step.phone, code);
      if (!res.ok) return setError(res.error);
      setError(null);
      if (res.data.next === "done") return router.refresh();
      setStep({ name: "signup", signupToken: res.data.signupToken, inviteRequired: res.data.inviteRequired });
    });
  };

  const submitSignup = (e: FormEvent) => {
    e.preventDefault();
    if (step.name !== "signup") return;
    start(async () => {
      const res = await completeSignup({
        signupToken: step.signupToken,
        name: name.trim(),
        ...(invite.trim() ? { inviteCode: invite.trim().toUpperCase() } : {}),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        smsConsent: consent,
      });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  };

  const errorLine = (
    <p className={styles.formError} aria-live="polite">
      {error ? <span className="error-text">{error}</span> : null}
    </p>
  );

  return (
    <div className={styles.signIn}>
      {step.name === "phone" ? (
        <form onSubmit={submitPhone} className={styles.form} noValidate>
          <div className={styles.formHead}>
            <span className="eyebrow">Sign in</span>
            <h1 className={styles.h1}>Your Relay account</h1>
            <p className="muted">Enter the mobile number you text Relay from. We&apos;ll send you a code.</p>
          </div>
          <div className="field">
            <label htmlFor="phone" className="label">
              Mobile number
            </label>
            <div className={styles.phoneRow}>
              <span className={styles.prefix}>+1</span>
              <input
                id="phone"
                className="input"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(512) 555-0123"
                value={formatUs(digits)}
                onChange={(e) => {
                  let d = e.target.value.replace(/\D/g, "");
                  if (d.length > 10 && d.startsWith("1")) d = d.slice(1);
                  setDigits(d.slice(0, 10));
                  setError(null);
                }}
                autoFocus
                aria-invalid={error ? true : undefined}
              />
            </div>
          </div>
          {errorLine}
          <button className="btn btn-primary btn-block" disabled={digits.length !== 10 || pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : null}
            Send code
          </button>
        </form>
      ) : null}

      {step.name === "code" ? (
        <form onSubmit={submitCode} className={styles.form} noValidate>
          <div className={styles.formHead}>
            <span className="eyebrow">Check your texts</span>
            <h1 className={styles.h1}>Enter the code</h1>
            <p className="muted">
              Sent to {formatUs(step.phone.slice(2))}.{" "}
              <button type="button" className={styles.linkButton} onClick={() => setStep({ name: "phone" })}>
                Change number
              </button>
            </p>
          </div>
          <div className="field">
            <label htmlFor="code" className="label">
              Verification code
            </label>
            <input
              id="code"
              className={`input ${styles.codeInput}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setError(null);
              }}
              autoFocus
              aria-invalid={error ? true : undefined}
            />
          </div>
          {errorLine}
          <button className="btn btn-primary btn-block" disabled={code.length < 4 || pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : null}
            Continue
          </button>
        </form>
      ) : null}

      {step.name === "signup" ? (
        <form onSubmit={submitSignup} className={styles.form} noValidate>
          <div className={styles.formHead}>
            <span className="eyebrow">New account</span>
            <h1 className={styles.h1}>Set up Relay</h1>
            <p className="muted">A couple of details and you&apos;re in.</p>
          </div>
          <div className="field">
            <label htmlFor="name" className="label">
              Your name
            </label>
            <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {step.inviteRequired ? (
            <div className="field">
              <label htmlFor="invite" className="label">
                Invite code
              </label>
              <input
                id="invite"
                className="input"
                placeholder="XXXX-XXXX"
                autoCapitalize="characters"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
              />
              <span className="hint">Relay is invite-only during the beta.</span>
            </div>
          ) : null}
          <label className={styles.consent}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              {SMS_CONSENT_TEXT}{" "}
              <span className="muted">
                See the <Link href="/terms#sms">SMS terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
              </span>
            </span>
          </label>
          {errorLine}
          <button
            className="btn btn-primary btn-block"
            disabled={!name.trim() || (step.inviteRequired && invite.trim().length < 4) || !consent || pending}
          >
            {pending ? <span className="spinner" aria-hidden="true" /> : null}
            Create account
          </button>
        </form>
      ) : null}
    </div>
  );
}
