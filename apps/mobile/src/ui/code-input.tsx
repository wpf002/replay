import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { font, radius, space, useTheme } from "../theme";
import { Text } from "./text";

/** Six boxes backed by one hidden input, so iOS one-time-code autofill and paste both work. */
export function CodeInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  disabled,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);

  // Fires once when the code becomes complete, not whenever the parent re-renders.
  const complete = useRef(onComplete);
  complete.current = onComplete;
  useEffect(() => {
    if (value.length === length) complete.current(value);
  }, [value, length]);

  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Verification code" style={styles.row}>
      {Array.from({ length }, (_, i) => {
        const char = value[i] ?? "";
        const active = focused && !disabled && i === Math.min(value.length, length - 1);
        return (
          <View
            key={i}
            style={[
              styles.box,
              {
                backgroundColor: colors.surface,
                borderColor: error ? colors.danger : active ? colors.text : colors.borderStrong,
                borderWidth: active ? 2 : 1,
              },
            ]}
          >
            <Text variant="title" style={{ fontFamily: font.monoMedium, fontSize: 24, lineHeight: 28 }}>
              {char}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space[2] },
  box: { flex: 1, aspectRatio: 0.82, maxHeight: 64, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  hidden: { position: "absolute", opacity: 0, width: 1, height: 1 },
});
