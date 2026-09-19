export type GoogleCheck = { ok: true } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  invalid_client: "Google doesn't recognize that client ID.",
  deleted_client: "That OAuth client was deleted.",
  redirect_uri_mismatch: "The redirect URI isn't registered on this OAuth client.",
  unauthorized_client: "This client isn't allowed to use the web sign-in flow. Create a Web application client.",
};

/** Google's error pages carry a base64 payload whose readable part names the error. */
function errorFromLocation(location: string): string | null {
  const encoded = new URL(location).searchParams.get("authError");
  if (!encoded) return "unknown_error";
  const text = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
  return Object.keys(MESSAGES).find((k) => text.includes(k)) ?? "unknown_error";
}

/**
 * Starts Google's sign-in with this client and redirect URI without following it. A redirect to
 * the sign-in page means both are good; a redirect to /signin/oauth/error says what isn't.
 */
export async function checkGoogleClient(clientId: string, redirectUri: string): Promise<GoogleCheck> {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
  }).toString();
  try {
    const res = await fetch(url, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    if (location.includes("/signin/oauth/error")) {
      const code = errorFromLocation(location);
      return { ok: false, message: MESSAGES[code ?? ""] ?? "Google rejected the client configuration." };
    }
    return res.status >= 300 && res.status < 400 ? { ok: true } : { ok: false, message: `Unexpected response ${res.status}.` };
  } catch {
    return { ok: false, message: "Couldn't reach Google." };
  }
}

/** Exchanges a made-up code: "invalid_grant" means the secret is right; "invalid_client" means it isn't. */
export async function checkGoogleSecret(clientId: string, clientSecret: string, redirectUri: string): Promise<GoogleCheck> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: "relay-setup-check",
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant") return { ok: true };
    if (body.error === "invalid_client") return { ok: false, message: "The client secret doesn't match this client ID." };
    if (body.error === "redirect_uri_mismatch") return { ok: false, message: MESSAGES.redirect_uri_mismatch! };
    return { ok: false, message: `Google answered ${body.error ?? res.status}.` };
  } catch {
    return { ok: false, message: "Couldn't reach Google." };
  }
}
