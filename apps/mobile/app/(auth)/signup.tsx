import { SMS_CONSENT_TEXT, type AuthSession } from "@relay/types";
import { getCalendars } from "expo-localization";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { api, ApiError } from "../../src/lib/api";
import { openWeb } from "../../src/lib/relay";
import { useSession } from "../../src/lib/session";
import { space } from "../../src/theme";
import { Button, Card, Checkbox, Field, Screen, Stack, Text } from "../../src/ui";
import { PageHeader } from "../../src/ui/nav";

export default function Signup() {
  const { signupToken, inviteRequired } = useLocalSearchParams<{ signupToken: string; inviteRequired: string }>();
  const needsInvite = inviteRequired === "1";
  const { signIn } = useSession();
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length > 0 && (!needsInvite || invite.trim().length >= 4) && consent;

  async function submit() {
    if (!ready || loading) return;
    setLoading(true);
    setError(null);
    try {
      const session = await api<AuthSession>("/v1/auth/signup", {
        body: {
          signupToken,
          name: name.trim(),
          timezone: getCalendars()[0]?.timeZone ?? undefined,
          ...(invite.trim() ? { inviteCode: invite.trim() } : {}),
          smsConsent: consent,
          source: "app",
        },
      });
      await signIn(session.token, session.me);
      router.replace("/setup");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen keyboard footer={<Button label="Create account" block disabled={!ready} loading={loading} onPress={submit} />}>
      <PageHeader title="Set up your account" body="A couple of details and you're in." />
      <Stack gap={5}>
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          placeholder="First and last"
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="next"
          hint="Relay uses it when it writes emails or books things for you."
        />
        {needsInvite ? (
          <Field
            label="Invite code"
            value={invite}
            onChangeText={setInvite}
            placeholder="XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            hint="Relay is invite-only during the beta."
          />
        ) : null}
        <Card>
          <Checkbox checked={consent} onToggle={() => setConsent((c) => !c)}>
            <Text variant="body" style={{ lineHeight: 22 }}>
              {SMS_CONSENT_TEXT}
            </Text>
            <Text variant="caption" style={{ marginTop: space[2] }}>
              See the{" "}
              <Text variant="caption" color="text" style={{ textDecorationLine: "underline" }} onPress={() => void openWeb("/terms#sms")}>
                SMS terms
              </Text>{" "}
              and{" "}
              <Text variant="caption" color="text" style={{ textDecorationLine: "underline" }} onPress={() => void openWeb("/privacy")}>
                Privacy Policy
              </Text>
              .
            </Text>
          </Checkbox>
        </Card>
        {error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </Stack>
    </Screen>
  );
}
