import type { ReminderDTO } from "@relay/types";
import * as Haptics from "expo-haptics";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { api, ApiError } from "../src/lib/api";
import { whenLabel } from "../src/lib/format";
import { requireSession, useSession } from "../src/lib/session";
import { useApi } from "../src/lib/use-api";
import { radius, space, useTheme } from "../src/theme";
import { Appear, Card, Chip, EmptyState, ErrorBanner, Icon, Screen, Stack, Text } from "../src/ui";
import { PageHeader } from "../src/ui/nav";

const REPEAT: Record<NonNullable<ReminderDTO["recurrence"]>, string> = {
  daily: "Every day",
  weekdays: "Weekdays",
  weekly: "Every week",
};

function Reminders() {
  const { colors } = useTheme();
  const { refresh: refreshMe } = useSession();
  const reminders = useApi<{ items: ReminderDTO[] }>("/v1/reminders");
  const items = reminders.data?.items ?? [];

  function cancel(r: ReminderDTO) {
    Alert.alert("Cancel this reminder?", r.body, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel reminder",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/v1/reminders/${r.id}`, { method: "DELETE" });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            reminders.setData({ items: items.filter((x) => x.id !== r.id) });
            void refreshMe();
          } catch (err) {
            Alert.alert("Couldn't cancel it", err instanceof ApiError ? err.message : "Try again.");
          }
        },
      },
    ]);
  }

  return (
    <Screen refreshing={reminders.refreshing} onRefresh={reminders.refresh}>
      <PageHeader back title="Reminders" body="Relay texts you at the time you asked. Text “remind me …” to add one." />
      {reminders.error ? <ErrorBanner message={reminders.error} onRetry={reminders.refresh} /> : null}
      {!reminders.loading && !items.length ? (
        <EmptyState
          icon="bell"
          title="No reminders"
          body="Try texting “Remind me to call mom Sunday at 5” or “Remind me every weekday at 8 to take my meds.”"
        />
      ) : (
        <Stack gap={2}>
          {items.map((r, i) => (
            <Appear key={r.id} delay={Math.min(i, 10) * 40}>
              <Card style={styles.row}>
                <View style={[styles.bell, { backgroundColor: colors.surfaceMuted }]}>
                  <Icon name={r.recurrence ? "repeat" : "bell"} size={16} />
                </View>
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="bodyMedium">{r.body}</Text>
                  <View style={styles.meta}>
                    <Text variant="caption">{whenLabel(r.runAt)}</Text>
                    {r.recurrence ? <Chip label={REPEAT[r.recurrence]} /> : null}
                  </View>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Cancel ${r.body}`} hitSlop={8} onPress={() => cancel(r)} style={styles.x}>
                  <Icon name="x" size={18} tone="textMuted" />
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
  bell: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  meta: { flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" },
  x: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});

export default requireSession(Reminders);
