import { APP_SCHEME } from "@relay/types";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api } from "./api";

export type GoogleConnectResult = "connected" | "denied" | "error" | "dismissed";

/**
 * Opens Google's consent screen in an auth session. The API's callback redirects to
 * relay://connections?google=..., which closes the session and hands back the result.
 */
export async function connectGoogle(): Promise<GoogleConnectResult> {
  const { url } = await api<{ url: string }>("/v1/connections/google", { body: { returnTo: "app" } });
  const result = await WebBrowser.openAuthSessionAsync(url, `${APP_SCHEME}://connections`);
  if (result.type !== "success") return "dismissed";
  const outcome = Linking.parse(result.url).queryParams?.google;
  return outcome === "connected" || outcome === "denied" ? outcome : "error";
}

export async function disconnectGoogle(): Promise<void> {
  await api("/v1/connections/google", { method: "DELETE" });
}
