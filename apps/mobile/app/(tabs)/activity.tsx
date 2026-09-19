import type { HistoryItemDTO } from "@relay/types";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError } from "../../src/lib/api";
import { clockTime, dayLabel } from "../../src/lib/format";
import { MODEL_INFO } from "../../src/lib/models";
import { openMessages, relayNumber } from "../../src/lib/relay";
import { useMe } from "../../src/lib/session";
import { radius, space, useTheme } from "../../src/theme";
import { EmptyState, ErrorBanner, Icon, Text } from "../../src/ui";
import { BubbleView } from "../../src/ui/thread";

type Row =
  | { kind: "message"; key: string; item: HistoryItemDTO }
  | { kind: "day"; key: string; label: string }
  | { kind: "call"; key: string; item: HistoryItemDTO };

/** Newest-first items -> rows for an inverted list (so day headers and call markers sit above their messages). */
function toRows(items: HistoryItemDTO[]): Row[] {
  const rows: Row[] = [];
  items.forEach((item, i) => {
    rows.push({ kind: "message", key: item.id, item });
    const older = items[i + 1];
    if (item.channel === "voice" && older?.conversationId !== item.conversationId) {
      rows.push({ kind: "call", key: `call-${item.conversationId}`, item });
    }
    if (!older || dayLabel(older.createdAt) !== dayLabel(item.createdAt)) {
      rows.push({ kind: "day", key: `day-${item.createdAt}`, label: dayLabel(item.createdAt) });
    }
  });
  return rows;
}

export default function Activity() {
  const me = useMe();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<HistoryItemDTO[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: HistoryItemDTO[]; nextBefore: string | null }>("/v1/history?limit=40");
      setItems(res.items);
      setNextBefore(res.nextBefore);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function loadMore() {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<{ items: HistoryItemDTO[]; nextBefore: string | null }>(
        `/v1/history?limit=40&before=${encodeURIComponent(nextBefore)}`,
      );
      setItems((prev) => [...prev, ...res.items]);
      setNextBefore(res.nextBefore);
    } catch {
      // Keep what's loaded; the next scroll retries.
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = useMemo(() => toRows(items), [items]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space[4], borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
      <Text variant="title" accessibilityRole="header">
        Activity
      </Text>
      <Text variant="caption">Every text and call with Relay, newest at the bottom.</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]}>
        {header}
        <View style={styles.emptyWrap}>
          {error ? <ErrorBanner message={error} onRetry={load} /> : null}
          <EmptyState
            icon="message-circle"
            title="No messages yet"
            body="Your texts and calls with Relay will show up here."
            action={{ label: "Text Relay", onPress: () => void openMessages(relayNumber(me.relayNumber), "Hi Relay") }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      {header}
      <FlatList
        inverted
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.textMuted} style={{ margin: space[4] }} /> : null}
        renderItem={({ item: row }) => {
          if (row.kind === "day") {
            return (
              <Text variant="eyebrow" center style={styles.day}>
                {row.label}
              </Text>
            );
          }
          if (row.kind === "call") {
            return (
              <View style={[styles.call, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Icon name={row.item.callOut ? "phone-outgoing" : "phone-incoming"} size={14} tone="textMuted" />
                <Text variant="caption">
                  {row.item.callOut ? "Relay called a business for you" : "You called Relay"} · {clockTime(row.item.createdAt)}
                </Text>
              </View>
            );
          }
          const m = row.item;
          const note =
            m.from === "relay"
              ? `${clockTime(m.createdAt)}${m.model ? ` · ${MODEL_INFO[m.model].name}` : ""}`
              : m.from === "other"
                ? `Business · ${clockTime(m.createdAt)}`
                : undefined;
          return (
            <View style={styles.message}>
              <BubbleView from={m.from === "user" ? "me" : m.from} text={m.content} {...(note ? { note } : {})} />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: space[4], paddingBottom: space[3], gap: space[1], borderBottomWidth: StyleSheet.hairlineWidth },
  emptyWrap: { padding: space[4], gap: space[4] },
  list: { paddingHorizontal: space[4], paddingVertical: space[4] },
  day: { marginVertical: space[4] },
  message: { marginVertical: space[1] },
  call: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: space[2],
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    marginVertical: space[3],
  },
});
