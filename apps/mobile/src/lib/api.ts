import { config } from "./config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Set by some endpoints so the app can offer a fix, like "no_credit". */
    readonly reason?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiToken(value: string | null): void {
  token = value;
}

/** Auth header for requests the app doesn't make through api(), like images. */
export function authHeaders(): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Called when the API rejects the session, so the app can sign out. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new ApiError("Can't reach Relay. Check your connection and try again.", 0);
  }

  const data = (await res.json().catch(() => null)) as { error?: string; reason?: string } | null;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(data?.error ?? "Something went wrong. Try again.", res.status, data?.reason);
  }
  return data as T;
}
