import * as Haptics from "expo-haptics";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { font, radius, size, space, useTheme } from "../theme";
import { Icon } from "./icon";
import { Text } from "./text";

type Kind = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  kind?: Kind;
  small?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Icon>["name"];
  style?: ViewStyle;
  /** Stretch to the parent's width. */
  block?: boolean;
  accessibilityHint?: string;
  trailing?: ReactNode;
}

export function Button({
  label,
  onPress,
  kind = "primary",
  small,
  loading,
  disabled,
  icon,
  style,
  block,
  accessibilityHint,
  trailing,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: colors.accent, pressed: colors.accentPressed, fg: colors.accentFg, border: colors.accent },
    secondary: { bg: colors.surface, pressed: colors.surfaceMuted, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: "transparent", pressed: colors.surfaceMuted, fg: colors.text, border: "transparent" },
    danger: { bg: colors.surface, pressed: colors.surfaceMuted, fg: colors.danger, border: colors.borderStrong },
  }[kind];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={() => {
        if (kind === "primary") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height: small ? 40 : 48,
          paddingHorizontal: small ? space[4] : space[5],
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        block && styles.block,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
          <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
          {trailing}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  block: { alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: space[2] },
  label: { fontFamily: font.medium, fontSize: size.base, lineHeight: 20 },
});
