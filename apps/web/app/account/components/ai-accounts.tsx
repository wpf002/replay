"use client";

import { AI_PROVIDERS, detectKeyProvider, MODELS, type AiAccountDTO, type ModelId } from "@relay/types";
import { useState, useTransition } from "react";
import { connectAiAccount, disconnectAiAccount, type ConnectResult } from "../actions";
import styles from "../account.module.css";

function ConnectForm({ provider, onDone }: { provider: ModelId; onDone: () => void }) {
  const info = AI_PROVIDERS[provider];
  const [key, setKey] = useState("");
  const [result, setResult] = useState<ConnectResult | null>(null);
  const [pending, start] = useTransition();
  const detected = key ? detectKeyProvider(key) : null;
  const mismatch = detected && detected !== provider ? AI_PROVIDERS[detected] : null;
  const error = result && !result.ok ? result : null;

  return (
    <form
      className={styles.keyForm}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await connectAiAccount(provider, key.trim());
          setResult(res);
          if (res.ok) {
            setKey("");
            onDone();
          }
        });
      }}
    >
      <ol className={styles.steps}>
        <li>
          <a href={info.keyUrl} target="_blank" rel="noreferrer">
            Create a key at {info.company}
          </a>{" "}
          and name it Relay.
        </li>
        <li>Paste it here.</li>
      </ol>
      <div className={styles.inline}>
        <input
          className="input"
          type="password"
          name={`${provider}-api-key`}
          placeholder={`${info.keyPrefix}…`}
          aria-label={`${info.name} API key`}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => {
            setKey(e.target.value.replace(/\s+/g, ""));
            setResult(null);
          }}
        />
        <button className="btn btn-primary btn-sm" disabled={!key || pending}>
          {pending ? "Checking…" : "Connect"}
        </button>
        {mismatch ? <p className="muted">That looks like a {mismatch.name} key.</p> : null}
        {error ? (
          <p className="error-text" aria-live="polite">
            {error.error}{" "}
            {error.reason === "no_credit" ? (
              <a href={info.billingUrl} target="_blank" rel="noreferrer">
                Add credit
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
      <p className={styles.meta}>{info.billingNote} To use your {info.planName} plan instead, sign in to {info.name} from the Relay app.</p>
    </form>
  );
}

function status(account: AiAccountDTO, included: boolean): string {
  if (account.connected) {
    if (account.invalid) return "Key stopped working";
    return account.mode === "browser" ? "Signed in to your account" : `Your key ${account.hint ?? ""}`;
  }
  return included ? "Included up to a daily limit" : "Not connected";
}

/** Each person connects their own Claude, ChatGPT, and Perplexity API keys. */
export function AiAccounts({ accounts, included }: { accounts: AiAccountDTO[]; included: ModelId[] }) {
  const [open, setOpen] = useState<ModelId | null>(null);
  const [pending, start] = useTransition();

  return (
    <ul className={styles.list}>
      {MODELS.map((m) => {
        const info = AI_PROVIDERS[m];
        const account: AiAccountDTO = accounts.find((a) => a.provider === m) ?? { provider: m, connected: false, mode: "key", hint: null, invalid: false, connectedAt: null };
        const working = account.connected && !account.invalid;
        return (
          <li key={m} className={styles.aiRow}>
            <div className={styles.aiHead}>
              <span>
                <strong>{info.name}</strong> <code className={styles.prefix}>{info.prefix}</code>
                <span className={styles.meta}>{status(account, included.includes(m))}</span>
              </span>
              {working ? (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => start(() => disconnectAiAccount(m))}
                  aria-label={`Disconnect ${info.name}`}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  className={open === m ? "btn btn-ghost btn-sm" : "btn btn-sm"}
                  onClick={() => setOpen(open === m ? null : m)}
                  aria-expanded={open === m}
                >
                  {open === m ? "Cancel" : account.invalid ? "Update key" : "Connect"}
                </button>
              )}
            </div>
            {open === m && !working ? <ConnectForm provider={m} onDone={() => setOpen(null)} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
