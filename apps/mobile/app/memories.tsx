import type { MemoryDTO } from "@relay/types";
import * as Haptics from "expo-haptics";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { api, ApiError } from "../src/lib/api";
import { relativeTime } from "../src/lib/format";
import { requireSession, useSession } from "../src/lib/session";
import { useApi } from "../src/lib/use-api";
import { radius, space, useTheme } from "../src/theme";
import { Appear, Card, EmptyState, ErrorBanner, Icon, Screen, Stack, Text } from "../src/ui";
import { PageHeader } from "../src/ui/nav";

function Memories() {
  const { colors } = useTheme();
  const { refresh: refreshMe } = useSession();
  const memories = useApi<{ items: MemoryDTO[] }>("/v1/memories");
  const items = memories.data?.items ?? [];

  function remove(m: MemoryDTO) {
    Alert.alert("Forget this?", `"${m.fact}"`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Forget",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/v1/memories/${m.id}`, { method: "DELETE" });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            memories.setData({ items: items.filter((x) => x.id !== m.id) });
            void refreshMe();
          } catch (err) {
            Alert.alert("Couldn't forget it", err instanceof ApiError ? err.message : "Try again.");
          }
        },
      },
    ]);
  }

  return (
    <Screen refreshing={memories.refreshing} onRefresh={memories.refresh}>
      <PageHeader
        back
        title="Memories"
        body="What Relay knows about you. Text “remember …” to add something or “forget …” to remove it."
      />
      {memories.error ? <ErrorBanner message={memories.error} onRetry={memories.refresh} /> : null}
      {!memories.loading && !items.length ? (
        <EmptyState
          icon="bookmark"
          title="Nothing saved yet"
          body="Try texting “Remember that my wife's name is Sarah” or “Remember I'm vegetarian.”"
        />
      ) : (
        <Stack gap={2}>
          {items.map((m, i) => (
            <Appear key={m.id} delay={Math.min(i, 10) * 40}>
              <Card style={styles.row}>
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="body">{m.fact}</Text>
                  <Text variant="caption">Saved {relativeTime(m.createdAt)}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Forget ${m.fact}`}
                  hitSlop={8}
                  onPress={() => remove(m)}
                  style={({ pressed }) => [styles.trash, { backgroundColor: pressed ? colors.surfaceMuted : "transparent" }]}
                >
                  <Icon name="trash-2" size={18} tone="textMuted" />
                </Pressable>
              </Card>
            </Appear>
          ))}
        </Stack>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  trash: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});

export default requireSession(Memories);
