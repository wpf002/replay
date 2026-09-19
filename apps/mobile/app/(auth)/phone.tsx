import { router } from "expo-router";
import { useState } from "react";
import { api, ApiError } from "../../src/lib/api";
import { formatUsInput } from "../../src/lib/format";
import { font, useTheme } from "../../src/theme";
import { Button, Field, Screen, Text } from "../../src/ui";
import { PageHeader } from "../../src/ui/nav";

export default function Phone() {
  const { colors } = useTheme();
  const [digits, setDigits] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formatted = formatUsInput(digits);
  const valid = digits.length === 10;

  async function submit() {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    const phone = `+1${digits}`;
    try {
      await api("/v1/auth/start", { body: { phone } });
      router.push({ pathname: "/verify", params: { phone } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      keyboard
      footer={<Button label="Send code" block disabled={!valid} loading={loading} onPress={submit} />}
    >
      <PageHeader
        back
        title="What's your number?"
        body="We'll text you a code to confirm it's yours. This is the number you'll text and call Relay from."
      />
      <Field
        large
        autoFocus
        value={formatted}
        placeholder="(512) 555-0123"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        accessibilityLabel="Mobile number"
        returnKeyType="done"
        onSubmitEditing={submit}
        error={error}
        leading={
          <Text variant="body" style={{ fontFamily: font.monoMedium, fontSize: 20, color: colors.textMuted }}>
            +1
          </Text>
        }
        onChangeText={(text) => {
          let d = text.replace(/\D/g, "");
          if (d.length > 10 && d.startsWith("1")) d = d.slice(1);
          // Backspace over a formatting character removes the digit before it.
          if (text.length < formatted.length && d === digits) d = d.slice(0, -1);
          setDigits(d.slice(0, 10));
          setError(null);
        }}
      />
    </Screen>
  );
}
