import { defineConfig } from "vitest/config";

// DB-backed tests run when TEST_DATABASE_URL is set and skip otherwise.
export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1",
      TOKEN_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    },
    fileParallelism: false,
  },
});
