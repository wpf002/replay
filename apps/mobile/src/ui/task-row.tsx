import type { ComputerTaskDTO } from "@relay/types";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { authHeaders } from "../lib/api";
import { relativeTime } from "../lib/format";
import { hostOf, isActive, screenUrl, taskStatus } from "../lib/tasks";
import { radius, space, useTheme } from "../theme";
import { Icon } from "./icon";
import { Text } from "./text";

/** A browser task on Home: a live thumbnail while it runs, the result once it's done. */
export function TaskRow({ task }: { task: ComputerTaskDTO }) {
  const { colors } = useTheme();
  const status = taskStatus(task);
  const active = isActive(task);
  const needsYou = task.state === "waiting_user" || task.state === "waiting_approval";
  const host = hostOf(task.url);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${status.label}: ${task.goal}`}
      onPress={() => router.push(`/task/${task.id}`)}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: needsYou ? colors.accent : colors.border,
          borderWidth: needsYou ? 2 : 1,
          padding: needsYou ? space[3] - 1 : space[3],
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        {active && task.screenVersion ? (
          <Image
            source={{ uri: screenUrl(task.id, task.screenVersion), headers: authHeaders() }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="top"
            transition={120}
          />
        ) : (
          <Icon name={active ? "globe" : task.state === "done" ? "check" : "x"} size={20} tone="textMuted" />
        )}
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text variant="bodyMedium" numberOfLines={2}>
          {task.goal}
        </Text>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: colors[status.tone] }]} />
          <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>
            {active
              ? `${needsYou && task.waitingFor ? task.waitingFor : status.label}${host && !needsYou ? ` · ${host}` : ""}`
              : `${task.summary ?? status.label} · ${relativeTime(task.endedAt ?? task.createdAt)}`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space[3], alignItems: "center", borderRadius: radius.md },
  thumb: {
    width: 80,
    height: 50,
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  status: { flexDirection: "row", alignItems: "center", gap: space[2] },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
});
