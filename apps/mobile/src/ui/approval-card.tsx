import type { ActionDTO } from "@relay/types";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { actionMeta } from "../lib/actions";
import { api, ApiError } from "../lib/api";
import { relativeTime, timeUntil } from "../lib/format";
import { radius, space, useTheme } from "../theme";
import { Button } from "./button";
import { Icon } from "./icon";
import { Card } from "./layout";
import { Text } from "./text";

/** A request waiting for the user's OK. The summary is exactly what will run. */
export function ApprovalCard({ action, onChange }: { action: ActionDTO; onChange: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const meta = actionMeta(action);

  async function decide(kind: "approve" | "deny") {
    if (kind === "approve" && action.requiresPin) {
      router.push({ pathname: "/pin", params: { mode: "approve", actionId: action.id } });
      return;
    }
    setBusy(kind);
    try {
      await api(`/v1/actions/${action.id}/${kind}`, { body: {} });
      void Haptics.notificationAsync(
        kind === "approve" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );
      onChange();
    } catch (err) {
      Alert.alert("That didn't work", err instanceof ApiError ? err.message : "Try again.");
      onChange();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: space[4] }}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name={meta.icon} size={18} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyMedium">{meta.label}</Text>
          <Text variant="caption">
            {action.channel === "voice" ? "From a call" : "From a text"} · {relativeTime(action.createdAt)}
            {action.expiresAt ? ` · expires ${timeUntil(action.expiresAt)}` : ""}
          </Text>
        </View>
      </View>

      <View style={[styles.summary, { backgroundColor: colors.surfaceMuted }]}>
        <Text variant="body" selectable>
          {action.summary}
        </Text>
      </View>

      {action.tainted ? (
        <View style={styles.warning}>
          <Icon name="alert-triangle" size={16} tone="textMuted" />
          <Text variant="caption" style={{ flex: 1 }}>
            Relay prepared this after reading email or web content. Make sure it's what you asked for.
          </Text>
        </View>
      ) : null}

      <View style={styles.buttons}>
        <Button label="Skip" kind="secondary" style={styles.flex} loading={busy === "deny"} disabled={busy !== null} onPress={() => decide("deny")} />
        <Button
          label={action.requiresPin ? "Approve with PIN" : "Approve"}
          style={styles.flex}
          loading={busy === "approve"}
          disabled={busy !== null}
          onPress={() => decide("approve")}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space[3] },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  summary: { borderRadius: radius.sm, padding: space[3] },
  warning: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  buttons: { flexDirection: "row", gap: space[2] },
  flex: { flex: 1 },
});
