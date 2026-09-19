import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "./api";

export interface Query<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  setData: (data: T) => void;
}

/** Loads `path` whenever the screen gains focus. Pull-to-refresh calls `refresh`. */
export function useApi<T>(path: string): Query<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loaded = useRef(false);

  const load = useCallback(
    async (mode: "focus" | "pull") => {
      if (mode === "pull") setRefreshing(true);
      try {
        setData(await api<T>(path));
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Something went wrong.");
      } finally {
        loaded.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path],
  );

  useFocusEffect(
    useCallback(() => {
      void load("focus");
    }, [load]),
  );

  const refresh = useCallback(() => load("pull"), [load]);
  return { data, error, loading: loading && !loaded.current, refreshing, refresh, setData };
}
