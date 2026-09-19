import { getPrisma } from "@relay/db";
import { google, type Auth } from "googleapis";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { env, need } from "./env.js";
import { log } from "./log.js";

export const GOOGLE_SCOPES = {
  gmailRead: "https://www.googleapis.com/auth/gmail.readonly",
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
  calendar: "https://www.googleapis.com/auth/calendar.events",
} as const;

const REQUESTED = ["openid", "email", ...Object.values(GOOGLE_SCOPES)];

export function googleRedirectUri(): string {
  return env().GOOGLE_REDIRECT_URI ?? `${need("PUBLIC_API_URL").replace(/\/+$/, "")}/oauth/google/callback`;
}

export function googleOAuthClient(): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    need("GOOGLE_CLIENT_ID"),
    need("GOOGLE_CLIENT_SECRET"),
    googleRedirectUri(),
  );
}

export function googleConsentUrl(state: string): string {
  return googleOAuthClient().generateAuthUrl({
    access_type: "offline",
    // Always show consent so Google returns a refresh token, even on reconnect.
    prompt: "consent",
    include_granted_scopes: true,
    scope: REQUESTED,
    state,
  });
}

/** Exchanges the callback code and stores the tokens encrypted. Returns the account email. */
export async function completeGoogleConnect(userId: string, code: string): Promise<string | null> {
  const client = googleOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Google returned no access token");

  let email: string | null = null;
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: need("GOOGLE_CLIENT_ID"),
    });
    email = ticket.getPayload()?.email ?? null;
  }

  const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);
  const data = {
    accountEmail: email,
    scopes,
    accessTokenEnc: encryptSecret(tokens.access_token),
    ...(tokens.refresh_token ? { refreshTokenEnc: encryptSecret(tokens.refresh_token) } : {}),
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
  await getPrisma().connection.upsert({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
    create: { userId, provider: "GOOGLE", ...data, refreshTokenEnc: data.refreshTokenEnc ?? null },
    update: data,
  });
  return email;
}

export class GoogleNotConnectedError extends Error {
  constructor(message = "Google isn't connected. Connect it in the Relay app.") {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

/**
 * An authorized client for the user. Refreshed access tokens are re-encrypted and saved.
 * Throws GoogleNotConnectedError when there's no connection or a required scope is missing.
 */
export async function googleAuthFor(userId: string, requiredScopes: string[] = []): Promise<Auth.OAuth2Client> {
  const prisma = getPrisma();
  const conn = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
  });
  if (!conn) throw new GoogleNotConnectedError();
  const missing = requiredScopes.filter((s) => !conn.scopes.includes(s));
  if (missing.length) {
    throw new GoogleNotConnectedError(
      "Google is connected without that permission. Reconnect Google in the Relay app and allow Gmail and Calendar.",
    );
  }

  const client = googleOAuthClient();
  client.setCredentials({
    access_token: decryptSecret(conn.accessTokenEnc),
    ...(conn.refreshTokenEnc ? { refresh_token: decryptSecret(conn.refreshTokenEnc) } : {}),
    ...(conn.expiresAt ? { expiry_date: conn.expiresAt.getTime() } : {}),
  });
  client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    prisma.connection
      .update({
        where: { id: conn.id },
        data: {
          accessTokenEnc: encryptSecret(tokens.access_token),
          ...(tokens.refresh_token ? { refreshTokenEnc: encryptSecret(tokens.refresh_token) } : {}),
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      })
      .catch((err: unknown) => log.error({ err, userId }, "failed to save refreshed Google token"));
  });
  return client;
}

/** Revokes Relay's access at Google and deletes the stored tokens. */
export async function disconnectGoogle(userId: string): Promise<void> {
  const prisma = getPrisma();
  const conn = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
  });
  if (!conn) return;
  try {
    const token = conn.refreshTokenEnc ? decryptSecret(conn.refreshTokenEnc) : decryptSecret(conn.accessTokenEnc);
    await googleOAuthClient().revokeToken(token);
  } catch (err) {
    log.warn({ err, userId }, "Google token revoke failed; deleting local tokens anyway");
  }
  await prisma.connection.delete({ where: { id: conn.id } });
}
