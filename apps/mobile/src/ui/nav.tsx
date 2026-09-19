import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { radius, space, useTheme } from "../theme";
import { Icon } from "./icon";
import { Text } from "./text";

export function BackButton({ onPress }: { onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={12}
      onPress={onPress ?? (() => router.back())}
      style={({ pressed }) => [styles.back, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceMuted : colors.surface }]}
    >
      <Icon name="arrow-left" size={18} />
    </Pressable>
  );
}

/** Page title block: optional back button, eyebrow, title, and supporting text. */
export function PageHeader({
  title,
  eyebrow,
  body,
  back,
  trailing,
}: {
  title: string;
  eyebrow?: string;
  body?: ReactNode;
  back?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {back || trailing ? (
        <View style={styles.bar}>
          {back ? <BackButton /> : <View />}
          {trailing}
        </View>
      ) : null}
      <View style={{ gap: space[2] }}>
        {eyebrow ? <Text variant="eyebrow">{eyebrow}</Text> : null}
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {typeof body === "string" ? (
          <Text variant="body" color="textMuted">
            {body}
          </Text>
        ) : (
          body
        )}
      </View>
    </View>
  );
}

/** Dots showing progress through a multi-step flow. */
export function Steps({ count, current }: { count: number; current: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.steps} accessibilityLabel={`Step ${current + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.step,
            { backgroundColor: i <= current ? colors.text : colors.border, width: i === current ? 24 : 8 },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space[5] },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  steps: { flexDirection: "row", gap: space[1], alignItems: "center" },
  step: { height: 8, borderRadius: radius.pill },
});
