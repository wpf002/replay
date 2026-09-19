"use server";

import { MODELS, type AuthSession, type AuthVerifyResult, type ModelId } from "@relay/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api, ApiError, clearSession, setSession } from "../../lib/session";

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof ApiError ? err.message : "Something went wrong." };
  }
}

// ── Sign-in ──────────────────────────────────────────

export async function startSignIn(phone: string): Promise<Result> {
  return attempt(async () => {
    await api("/v1/auth/start", { body: { phone } });
    return null;
  });
}

export type VerifyOutcome = { next: "signup"; signupToken: string; inviteRequired: boolean } | { next: "done" };

export async function verifyCode(phone: string, code: string): Promise<Result<VerifyOutcome>> {
  const res = await attempt(() => api<AuthVerifyResult>("/v1/auth/verify", { body: { phone, code } }));
  if (!res.ok) return res;
  if (res.data.status === "ok") {
    await setSession(res.data.token);
    return { ok: true, data: { next: "done" } };
  }
  return {
    ok: true,
    data: { next: "signup", signupToken: res.data.signupToken, inviteRequired: res.data.inviteRequired },
  };
}

export async function completeSignup(input: {
  signupToken: string;
  name: string;
  inviteCode?: string;
  timezone?: string;
  smsConsent: boolean;
}): Promise<Result> {
  const res = await attempt(() => api<AuthSession>("/v1/auth/signup", { body: { ...input, source: "web" } }));
  if (!res.ok) return res;
  await setSession(res.data.token);
  return { ok: true, data: null };
}

export async function signOut(): Promise<void> {
  await clearSession();
  redirect("/account");
}

// ── Signed-in mutations. Each one re-renders /account with fresh data. ──────

async function mutate(fn: () => Promise<unknown>): Promise<Result> {
  const res = await attempt(async () => {
    await fn();
    return null;
  });
  if (!res.ok && res.error.includes("session")) {
    await clearSession();
  }
  revalidatePath("/account");
  return res;
}

export async function approveAction(id: string, pin?: string): Promise<Result> {
  return mutate(() => api(`/v1/actions/${id}/approve`, { body: pin ? { pin } : {} }));
}

export async function denyAction(id: string): Promise<Result> {
  return mutate(() => api(`/v1/actions/${id}/deny`, { body: {} }));
}

export async function updateSettings(form: FormData): Promise<void> {
  const body: Record<string, string> = {};
  for (const key of ["defaultModel", "timezone", "name"] as const) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim()) body[key] = value.trim();
  }
  await mutate(() => api("/v1/me", { method: "PATCH", body }));
}

export type ConnectResult = { ok: true } | { ok: false; error: string; reason?: string };

/** Sends the pasted key to the API, which checks it with the provider before saving it. */
export async function connectAiAccount(provider: ModelId, key: string): Promise<ConnectResult> {
  if (!MODELS.includes(provider)) return { ok: false, error: "Unknown provider." };
  try {
    await api(`/v1/ai-accounts/${provider}`, { method: "PUT", body: { key } });
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message, ...(err.reason ? { reason: err.reason } : {}) };
    return { ok: false, error: "Something went wrong." };
  }
  revalidatePath("/account");
  return { ok: true };
}

export async function disconnectAiAccount(provider: ModelId): Promise<void> {
  if (!MODELS.includes(provider)) return;
  await mutate(() => api(`/v1/ai-accounts/${provider}`, { method: "DELETE" }));
}

export async function connectGoogle(): Promise<void> {
  const { url } = await api<{ url: string }>("/v1/connections/google", { body: { returnTo: "web" } });
  redirect(url);
}

export async function disconnectGoogle(): Promise<void> {
  await mutate(() => api("/v1/connections/google", { method: "DELETE" }));
}

export async function deleteMemory(id: string): Promise<void> {
  await mutate(() => api(`/v1/memories/${id}`, { method: "DELETE" }));
}

export async function cancelReminder(id: string): Promise<void> {
  await mutate(() => api(`/v1/reminders/${id}`, { method: "DELETE" }));
}

export async function setPin(pin: string, currentPin?: string): Promise<Result> {
  return mutate(() => api("/v1/me/pin", { method: "PUT", body: { pin, ...(currentPin ? { currentPin } : {}) } }));
}

export async function deleteAccount(form: FormData): Promise<Result> {
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { ok: false, error: "Type DELETE to confirm." };
  }
  const res = await attempt(() => api("/v1/me", { method: "DELETE" }));
  if (!res.ok) return { ok: false, error: res.error };
  await clearSession();
  redirect("/account?deleted=1");
}
