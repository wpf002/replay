import { need } from "@relay/core";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";

const ISSUER = "relay";

function secret(): Uint8Array {
  return new TextEncoder().encode(need("JWT_SECRET"));
}

type Purpose = "session" | "signup" | "oauth";

async function sign(purpose: Purpose, subject: string, claims: Record<string, unknown>, ttl: string) {
  return new SignJWT({ ...claims, typ: purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret());
}

async function verify(purpose: Purpose, token: string): Promise<JWTPayload & { sub: string }> {
  const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, algorithms: ["HS256"] });
  if (payload.typ !== purpose || typeof payload.sub !== "string") {
    throw new Error("Wrong token type");
  }
  return payload as JWTPayload & { sub: string };
}

/** Session for the app and web. `ver` must match User.tokenVersion, which "sign out everywhere" bumps. */
export function signSession(user: { id: string; tokenVersion: number }): Promise<string> {
  return sign("session", user.id, { ver: user.tokenVersion }, "30d");
}

export async function verifySession(token: string): Promise<{ userId: string; version: number }> {
  const payload = await verify("session", token);
  return { userId: payload.sub, version: Number(payload.ver) };
}

/** Proves a phone number was verified, for the signup step that follows. */
export function signSignupToken(phone: string): Promise<string> {
  return sign("signup", phone, {}, "20m");
}

export async function verifySignupToken(token: string): Promise<string> {
  return (await verify("signup", token)).sub;
}

export type OAuthReturn = "app" | "web";

/** OAuth `state`: binds the Google callback to the user who started it. */
export function signOAuthState(userId: string, returnTo: OAuthReturn): Promise<string> {
  return sign("oauth", userId, { ret: returnTo }, "10m");
}

export async function verifyOAuthState(state: string): Promise<{ userId: string; returnTo: OAuthReturn }> {
  const payload = await verify("oauth", state);
  return { userId: payload.sub, returnTo: payload.ret === "web" ? "web" : "app" };
}
