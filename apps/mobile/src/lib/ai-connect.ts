import { AI_PROVIDERS, detectKeyProvider, MODELS, type MeDTO, type ModelId } from "@relay/types";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { useSession } from "./session";

export interface ConnectError {
  message: string;
  /** "no_credit", "invalid", "model", "wrong_provider:gpt", ... */
  reason?: string;
}

export interface AiConnect {
  provider: ModelId;
  key: string;
  setKey: (value: string) => void;
  checking: boolean;
  error: ConnectError | null;
  /** The key in the field belongs to a different provider. */
  otherProvider: ModelId | null;
  /** They opened the provider's key page and came back. */
  visitedKeyPage: boolean;
  connect: (as?: ModelId) => Promise<boolean>;
  /** Fills the field from the clipboard, and connects right away when it's clearly this provider's key. */
  paste: (text: string) => void;
  openKeyPage: () => Promise<void>;
  openBilling: () => Promise<void>;
}

/** State and actions for connecting one provider's API key. The key never leaves this screen except to Relay's API. */
export function useAiConnect(initial: ModelId, onConnected?: (me: MeDTO, provider: ModelId) => void): AiConnect {
  const { setMe } = useSession();
  const [provider, setProvider] = useState(initial);
  const [key, setKeyValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<ConnectError | null>(null);
  const [visitedKeyPage, setVisited] = useState(false);

  // Follow the caller's choice, e.g. picking a different AI earlier in setup.
  useEffect(() => {
    setProvider(initial);
    setError(null);
  }, [initial]);

  const detected = key ? detectKeyProvider(key) : null;
  const fromServer = error?.reason?.startsWith("wrong_provider:") ? error.reason.slice("wrong_provider:".length) : null;
  const other = (detected && detected !== provider ? detected : fromServer) as ModelId | null;

  function setKey(value: string) {
    setKeyValue(value.replace(/\s+/g, ""));
    setError(null);
  }

  async function connect(as: ModelId = provider, value: string = key): Promise<boolean> {
    if (!value || checking) return false;
    if (as !== provider) setProvider(as);
    setChecking(true);
    setError(null);
    try {
      const me = await api<MeDTO>(`/v1/ai-accounts/${as}`, { method: "PUT", body: { key: value } });
      setMe(me);
      setKeyValue("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConnected?.(me, as);
      return true;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { message: err.message, ...(err.reason ? { reason: err.reason } : {}) }
          : { message: "Couldn't connect. Try again." },
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return false;
    } finally {
      setChecking(false);
    }
  }

  function paste(text: string) {
    const value = text.replace(/\s+/g, "");
    setKey(value);
    if (value && detectKeyProvider(value) === provider) void connect(provider, value);
  }

  async function openKeyPage() {
    await WebBrowser.openBrowserAsync(AI_PROVIDERS[provider].keyUrl);
    setVisited(true);
  }

  async function openBilling() {
    await WebBrowser.openBrowserAsync(AI_PROVIDERS[provider].billingUrl);
  }

  return {
    provider,
    key,
    setKey,
    checking,
    error,
    otherProvider: other && MODELS.includes(other) ? other : null,
    visitedKeyPage,
    connect,
    paste,
    openKeyPage,
    openBilling,
  };
}
