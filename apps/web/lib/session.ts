import "server-only";
import { cookies } from "next/headers";
import { apiUrl } from "./site";

export const SESSION_COOKIE = "relay_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function setSession(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Set by some endpoints so the page can offer a fix, like "no_credit". */
    readonly reason?: string,
  ) {
    super(message);
  }
}

/** Server-side call to the Relay API with the signed-in user's token. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await sessionToken();
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Couldn't reach Relay. Try again in a minute.", 0);
  }
  const data = (await res.json().catch(() => null)) as { error?: string; reason?: string } | null;
  if (!res.ok) throw new ApiError(data?.error ?? "Something went wrong.", res.status, data?.reason);
  return data as T;
}
