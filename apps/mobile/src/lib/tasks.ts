import { COMPUTER_TASK_ACTIVE, type ComputerTaskDTO, type ComputerTaskState } from "@relay/types";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { config } from "./config";

export const isActive = (t: Pick<ComputerTaskDTO, "state">) => COMPUTER_TASK_ACTIVE.includes(t.state);

export function taskStatus(t: Pick<ComputerTaskDTO, "state" | "waitingKind">): { label: string; tone: "accent" | "text" | "textMuted" | "success" | "danger" } {
  const labels: Record<ComputerTaskState, { label: string; tone: "accent" | "text" | "textMuted" | "success" | "danger" }> = {
    queued: { label: "Starting", tone: "textMuted" },
    running: { label: "Working", tone: "text" },
    waiting_approval: { label: "Needs your OK", tone: "accent" },
    waiting_user: { label: "Needs you", tone: "accent" },
    done: { label: "Done", tone: "success" },
    failed: { label: "Didn't finish", tone: "danger" },
    canceled: { label: "Stopped", tone: "textMuted" },
  };
  if (t.state === "waiting_user" && t.waitingKind === "answer") return { label: "Question for you", tone: "accent" };
  return labels[t.state];
}

export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function screenUrl(taskId: string, version: string): string {
  return `${config.apiUrl}/v1/computer/tasks/${taskId}/screen?v=${encodeURIComponent(version)}`;
}

/**
 * Loads `path` while the screen is focused and keeps polling as long as `keepPolling` says so,
 * so live views update without sockets.
 */
export function useLive<T>(path: string, intervalMs: number, keepPolling: (data: T) => boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keep = useRef(keepPolling);
  keep.current = keepPolling;

  const load = useCallback(async (): Promise<T | null> => {
    try {
      const next = await api<T>(path);
      setData(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load.");
      return null;
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        const next = await load();
        if (stopped) return;
        if (next === null || keep.current(next)) timer = setTimeout(() => void tick(), intervalMs);
      };
      void tick();
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    }, [load, intervalMs]),
  );

  return { data, error, refresh: load, setData };
}
