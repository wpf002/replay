import { forwardRef, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { font, radius, size, space, useTheme } from "../theme";
import { Text } from "./text";

export interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  leading?: ReactNode;
  large?: boolean;
}

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, error, leading, large, style, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.text : colors.borderStrong;

  return (
    <View style={styles.wrap}>
      {label ? <Text variant="bodyMedium">{label}</Text> : null}
      <View
        style={[
          styles.box,
          { borderColor, backgroundColor: colors.surface, height: large ? 64 : 48 },
          focused && { borderWidth: 2 },
        ]}
      >
        {leading}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            { color: colors.text, fontSize: large ? size.lg : size.base },
            large && { fontFamily: font.medium },
            style,
          ]}
        />
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
  },
  input: { flex: 1, fontFamily: font.regular, paddingVertical: 0 },
});
