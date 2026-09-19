import { pino, type LoggerOptions } from "pino";

/** Paths that must never reach logs: OAuth tokens, PINs, auth headers, verification codes. */
export const REDACT_PATHS = [
  "*.accessToken",
  "*.refreshToken",
  "*.access_token",
  "*.refresh_token",
  "*.id_token",
  "*.accessTokenEnc",
  "*.refreshTokenEnc",
  "*.pin",
  "*.pinHash",
  "*.code",
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-twilio-signature"]',
];

export const logOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
};

export const log = pino(logOptions);
