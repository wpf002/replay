import Constants from "expo-constants";

interface Extra {
  apiUrl: string;
  relayNumber: string | null;
  webUrl: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

export const config: Extra = {
  apiUrl: extra.apiUrl ?? "http://localhost:4000",
  relayNumber: extra.relayNumber ?? null,
  webUrl: extra.webUrl ?? "http://localhost:3000",
};
