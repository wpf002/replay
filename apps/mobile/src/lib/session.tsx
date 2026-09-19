import type { MeDTO } from "@relay/types";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setApiToken, setUnauthorizedHandler } from "./api";

const TOKEN_KEY = "relay.session";

interface SessionValue {
  /** false until the stored session has been checked. */
  ready: boolean;
  me: MeDTO | null;
  signIn: (token: string, me: MeDTO) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<MeDTO | null>;
  setMe: (me: MeDTO) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeDTO | null>(null);

  const signOut = useCallback(async () => {
    setApiToken(null);
    setMe(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await api<MeDTO>("/v1/me");
      setMe(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    (async () => {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY);
      if (stored) {
        setApiToken(stored);
        const next = await refresh();
        if (!next) setApiToken(null);
      }
      setReady(true);
    })();
  }, [refresh, signOut]);

  const signIn = useCallback(async (token: string, next: MeDTO) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    setApiToken(token);
    setMe(next);
  }, []);

  const value = useMemo(
    () => ({ ready, me, signIn, signOut, refresh, setMe }),
    [ready, me, signIn, signOut, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}

/** The signed-in user. Only use inside the signed-in part of the app. */
export function useMe(): MeDTO {
  const { me } = useSession();
  if (!me) throw new Error("useMe without a session");
  return me;
}
