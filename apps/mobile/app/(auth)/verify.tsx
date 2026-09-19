import type { AuthVerifyResult } from "@relay/types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../src/lib/api";
import { formatPhone } from "../../src/lib/format";
import { useSession } from "../../src/lib/session";
import { space } from "../../src/theme";
import { Button, Screen, Stack, Text } from "../../src/ui";
import { CodeInput } from "../../src/ui/code-input";
import { PageHeader } from "../../src/ui/nav";

const RESEND_SECONDS = 30;

export default function Verify() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { signIn } = useSession();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function verify(value: string) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<AuthVerifyResult>("/v1/auth/verify", { body: { phone, code: value } });
      if (res.status === "ok") {
        await signIn(res.token, res.me);
        router.replace("/(tabs)");
      } else {
        router.replace({
          pathname: "/signup",
          params: { signupToken: res.signupToken, inviteRequired: res.inviteRequired ? "1" : "0" },
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await api("/v1/auth/start", { body: { phone } });
      setWait(RESEND_SECONDS);
      setResent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't resend the code.");
    }
  }

  return (
    <Screen keyboard>
      <PageHeader
        back
        title="Enter the code"
        body={
          <Text variant="body" color="textMuted">
            Sent to <Text variant="bodyMedium">{formatPhone(phone)}</Text>.
          </Text>
        }
      />
      <Stack gap={3}>
        <CodeInput value={code} onChange={(v) => { setCode(v); setError(null); }} onComplete={verify} error={Boolean(error)} disabled={loading} />
        {error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : resent ? (
          <Text variant="caption">New code sent.</Text>
        ) : null}
      </Stack>
      <Stack gap={2} style={{ alignItems: "flex-start", marginTop: -space[2] }}>
        <Button
          kind="ghost"
          small
          label={wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
          disabled={wait > 0}
          onPress={resend}
          style={{ paddingHorizontal: 0 }}
        />
        {loading ? <Text variant="caption">Checking…</Text> : null}
      </Stack>
    </Screen>
  );
}
