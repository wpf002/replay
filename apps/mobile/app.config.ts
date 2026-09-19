import { config as loadEnv } from "dotenv";
import type { ConfigContext, ExpoConfig } from "expo/config";

// The monorepo keeps one .env at the root. Values the app needs at runtime go into `extra`.
loadEnv({ path: ["../../.env", ".env"], quiet: true });

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Relay",
  slug: "relay",
  scheme: "relay",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  backgroundColor: "#faf9f7",
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    "expo-localization",
    [
      "expo-contacts",
      { contactsPermission: "Relay adds itself to your contacts so texts from it show up as Relay." },
    ],
  ],
  ios: {
    bundleIdentifier: "com.wpf002.relay",
    supportsTablet: false,
  },
  android: {
    package: "com.wpf002.relay",
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000",
    relayNumber: process.env.EXPO_PUBLIC_RELAY_NUMBER ?? null,
    webUrl: process.env.PUBLIC_WEB_URL ?? "http://localhost:3000",
  },
});
