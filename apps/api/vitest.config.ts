import { defineConfig } from "vitest/config";

// Integration tests hit a real Postgres and Redis. They run when TEST_DATABASE_URL is set and
// skip otherwise. Redis uses database 1 so tests never touch dev queues.
export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1",
      TWILIO_AUTH_TOKEN: "test_auth_token",
      PUBLIC_API_URL: "https://api.relay.test",
      PUBLIC_WEB_URL: "https://relay.test",
      SUPPORT_EMAIL: "help@relay.test",
      JWT_SECRET: "test-jwt-secret-that-is-long-enough-for-hs256",
      TOKEN_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    },
    fileParallelism: false,
  },
});
