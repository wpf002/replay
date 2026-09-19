import * as Haptics from "expo-haptics";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { font, radius, size, space, useTheme, type ColorName } from "../theme";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";
import { Text } from "./text";

export function Chip({ label, tone = "textMuted", mono }: { label: string; tone?: ColorName; mono?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
      <Text variant="caption" color={tone} style={mono ? { fontFamily: font.monoMedium } : { fontFamily: font.medium }}>
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceMuted }]}>
        <Icon name={icon} size={20} tone="textMuted" />
      </View>
      <Text variant="bodyMedium" center>
        {title}
      </Text>
      <Text variant="body" color="textMuted" center style={{ maxWidth: 300 }}>
        {body}
      </Text>
      {action ? <Button label={action.label} kind="secondary" small onPress={action.onPress} style={{ marginTop: space[2] }} /> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.banner, { borderColor: colors.danger, backgroundColor: colors.surface }]} accessibilityLiveRegion="polite">
      <Icon name="alert-circle" size={18} tone="danger" />
      <Text variant="body" style={{ flex: 1 }}>
        {message}
      </Text>
      {onRetry ? <Button label="Retry" kind="ghost" small onPress={onRetry} /> : null}
    </View>
  );
}

export function Checkbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => {
        void Haptics.selectionAsync();
        onToggle();
      }}
      style={styles.checkRow}
    >
      <View
        style={[
          styles.checkBox,
          { borderColor: checked ? colors.text : colors.borderStrong, backgroundColor: checked ? colors.text : colors.surface },
        ]}
      >
        {checked ? <Icon name="check" size={14} color={colors.bg} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

/** Choice cards for a small set of options: one of them, or several with `multi`. */
export function OptionCard({
  selected,
  onPress,
  title,
  subtitle,
  badge,
  multi,
  note,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle: string;
  badge?: string;
  /** Several can be picked at once, so the marker is a checkbox instead of a radio. */
  multi?: boolean;
  /** Small line under the title, e.g. "Default". */
  note?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={multi ? { checked: selected } : { selected }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? colors.accent : colors.border,
          borderWidth: selected ? 2 : 1,
          padding: selected ? space[4] - 1 : space[4],
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        },
      ]}
    >
      <View style={{ flex: 1, gap: space[1] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
          <Text variant="bodyMedium">{title}</Text>
          {badge ? <Chip label={badge} mono /> : null}
        </View>
        <Text variant="caption" style={{ fontSize: size.sm }}>
          {subtitle}
        </Text>
        {note ? <Text variant="caption">{note}</Text> : null}
      </View>
      <View
        style={[
          multi ? styles.box : styles.radio,
          { borderColor: selected ? colors.accent : colors.borderStrong },
          multi && selected ? { backgroundColor: colors.accent } : null,
        ]}
      >
        {selected ? multi ? <Icon name="check" size={14} color={colors.accentFg} /> : <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}
      </View>
    </Pressable>
  );
}

/** Fades and lifts children in. Motion is transform and opacity only. */
export function Appear({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: ViewStyle }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 250,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <View style={[styles.fillBar, { width: `${pct * 100}%`, backgroundColor: pct >= 0.9 ? colors.danger : colors.text }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: 2 },
  empty: {
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[6],
    paddingHorizontal: space[5],
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.md,
  },
  emptyIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: space[1] },
  banner: { flexDirection: "row", alignItems: "center", gap: space[3], borderWidth: 1, borderRadius: radius.md, padding: space[3] },
  checkRow: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  checkBox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 2 },
  option: { flexDirection: "row", alignItems: "center", gap: space[3], borderRadius: radius.md },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radio: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill },
  track: { height: 6, borderRadius: radius.pill, overflow: "hidden" },
  fillBar: { height: 6, borderRadius: radius.pill },
});
