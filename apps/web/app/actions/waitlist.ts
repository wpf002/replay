"use server";

import { headers } from "next/headers";
import { apiUrl } from "../../lib/site";

export type WaitlistState =
  | { status: "idle" }
  | { status: "success"; email: string }
  | { status: "error"; message: string; email: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const email = String(form.get("email") ?? "").trim();
  const source = String(form.get("source") ?? "landing").slice(0, 64);

  if (!EMAIL.test(email)) {
    return { status: "error", message: "Enter a valid email address.", email };
  }

  const forwardedFor = (await headers()).get("x-forwarded-for");
  try {
    const res = await fetch(apiUrl("/v1/waitlist"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
      body: JSON.stringify({ email, source }),
      cache: "no-store",
    });
    if (res.ok) return { status: "success", email };
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return {
      status: "error",
      message: res.status < 500 && body?.error ? body.error : "Something went wrong. Try again.",
      email,
    };
  } catch {
    return { status: "error", message: "Couldn't reach Relay. Try again in a minute.", email };
  }
}
