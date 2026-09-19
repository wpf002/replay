import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { resolve } from "node:path";

// One .env at the monorepo root serves every app.
loadEnvConfig(resolve(process.cwd(), "../.."));

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default config;
