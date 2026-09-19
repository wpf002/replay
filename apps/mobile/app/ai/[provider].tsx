import { AI_PROVIDERS, MODELS, type ComputerTaskDTO, type MeDTO } from "@relay/types";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useAiConnect } from "../../src/lib/ai-connect";
import { api, ApiError } from "../../src/lib/api";
import { ACCESS_LABEL, MODEL_INFO, modelAccess } from "../../src/lib/models";
import { useMe, useSession } from "../../src/lib/session";
import { radius, space, useTheme } from "../../src/theme";
import { Button, Card, Chip, Icon, Screen, Stack, Text } from "../../src/ui";
import { AiConnectForm } from "../../src/ui/ai-connect-form";
import { PageHeader } from "../../src/ui/nav";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Connect, replace, or remove one provider's API key. */
export default function AiAccount() {
  const params = useLocalSearchParams<{ provider: string }>();
  const initial = MODELS.find((m) => m === params.provider) ?? "claude";
  const me = useMe();
  const { setMe } = useSession();
  const { colors } = useTheme();
  const [replacing, setReplacing] = useState(false);
  const [useKey, setUseKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const conn = useAiConnect(initial, () => {
    setReplacing(false);
    setUseKey(false);
  });

  const provider = conn.provider;
  const info = AI_PROVIDERS[provider];
  const account = me.aiAccounts.find((a) => a.provider === provider);
  const access = modelAccess(me, provider);
  const connected = Boolean(account?.connected) && !account?.invalid;
  const signedIn = connected && account?.mode === "browser";
  // Connecting shows the two ways in; the key form only when they pick it.
  const showForm = (!connected || replacing) && useKey;
  const showChoice = !connected || replacing;

  async function signIn() {
    setBusy(true);
    try {
      const task = await api<ComputerTaskDTO>(`/v1/ai-accounts/${provider}/signin`, { body: {} });
      router.replace(`/task/${task.id}`);
    } catch (err) {
      Alert.alert("Couldn't open it", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(fn: () => Promise<MeDTO>) {
    setBusy(true);
    try {
      setMe(await fn());
    } catch (err) {
      Alert.alert("That didn't work", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  const disconnect = () =>
    Alert.alert(
      `Disconnect ${info.name}?`,
      me.includedModels.includes(provider)
        ? `Relay deletes your key and goes back to its included ${info.name} access, up to the daily limit.`
        : `Relay deletes your key and can't use ${info.name} for you until you connect it again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => void patch(() => api<MeDTO>(`/v1/ai-accounts/${provider}`, { method: "DELETE" })),
        },
      ],
    );

  const makeDefault = () =>
    void patch(() => api<MeDTO>("/v1/me", { method: "PATCH", body: { defaultModel: provider } }));

  const footer = showForm ? (
    <Stack gap={2}>
      <Button
        label={`Connect ${info.name}`}
        block
        loading={conn.checking}
        disabled={!conn.key || Boolean(conn.otherProvider)}
        onPress={() => void conn.connect()}
      />
      <Button label="Back" kind="ghost" block onPress={() => setUseKey(false)} />
    </Stack>
  ) : showChoice ? (
    <Stack gap={2}>
      <Button label={`Sign in to ${info.name}`} icon="log-in" block loading={busy} onPress={() => void signIn()} />
      <Button label="Use an API key instead" kind="ghost" block onPress={() => setUseKey(true)} />
      {replacing ? <Button label="Never mind" kind="ghost" block onPress={() => setReplacing(false)} /> : null}
    </Stack>
  ) : (
    <Stack gap={2}>
      <Button label="Done" block onPress={() => router.back()} />
      <Button label={signedIn ? "Sign in again" : "Replace key"} kind="secondary" block onPress={() => (signedIn ? void signIn() : setReplacing(true))} />
      <Button label="Disconnect" kind="danger" block loading={busy} onPress={disconnect} />
    </Stack>
  );

  return (
    <Screen footer={footer}>
      <PageHeader
        back
        eyebrow="AI account"
        title={showForm ? `Connect ${info.name}` : info.name}
        body={
          showForm
            ? `Relay sends requests straight to the ${info.company} API with your key. Nothing shows up in your ${info.name} history, and usage bills to your API account.`
            : showChoice
              ? `Relay signs in to ${info.name} in its own browser. Your texts become chats in your ${info.name} history, answered on your ${info.planName} plan.`
              : undefined
        }
      />

      {account?.invalid && !replacing ? (
        <Card style={{ gap: space[2], borderColor: colors.danger }}>
          <Text variant="bodyMedium">Your key stopped working</Text>
          <Text variant="body" color="textMuted">
            {info.company} rejected it. It may have been deleted or rotated. Paste a new one below.
          </Text>
        </Card>
      ) : null}

      {showChoice && !showForm ? (
        <Stack gap={3}>
          <Card style={{ gap: space[3] }}>
            <View style={styles.point}>
              <Icon name="message-square" size={18} tone="textMuted" />
              <Text variant="body" style={{ flex: 1 }}>
                Text Relay, and the chat shows up in {info.name} like you typed it there yourself.
              </Text>
            </View>
            <View style={styles.point}>
              <Icon name="credit-card" size={18} tone="textMuted" />
              <Text variant="body" style={{ flex: 1 }}>
                Answers come off your {info.planName} plan, not a separate API bill.
              </Text>
            </View>
            <View style={styles.point}>
              <Icon name="lock" size={18} tone="textMuted" />
              <Text variant="body" style={{ flex: 1 }}>
                You sign in yourself on the next screen. Relay never sees your password.
              </Text>
            </View>
          </Card>
          {access === "included" ? (
            <Text variant="caption">
              Until then, Relay answers with its own {info.name} access, up to a daily limit.
            </Text>
          ) : null}
        </Stack>
      ) : null}

      {showForm ? (
        <AiConnectForm conn={conn} />
      ) : (
        <Stack gap={4}>
          <Card style={styles.connected}>
            <View style={[styles.mark, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
              <Icon name={MODEL_INFO[provider].icon} size={22} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyMedium">{info.name}</Text>
              <Text variant={signedIn ? "body" : "mono"} color="textMuted">
                {signedIn ? `Signed in · your ${info.planName} plan` : `Key ${account?.hint ?? ""}`}
              </Text>
              {account?.connectedAt ? <Text variant="caption">Connected {shortDate(account.connectedAt)}</Text> : null}
            </View>
            <Chip label={ACCESS_LABEL[access]} tone="success" />
          </Card>

          <Card style={{ gap: space[3] }}>
            {me.defaultModel === provider ? (
              <Text variant="body">
                {signedIn
                  ? `Every text you send Relay goes into ${info.name} and comes back as a reply. Start a text with another prefix to switch for one message.`
                  : `${info.name} answers your texts and calls. Start a text with another prefix to switch for one message.`}
              </Text>
            ) : (
              <>
                <Text variant="body">
                  Start a text with <Text variant="mono">{info.prefix}</Text> to use {info.name} for that message.
                </Text>
                <Button
                  label={`Make ${info.name} my default`}
                  kind="secondary"
                  small
                  loading={busy}
                  onPress={makeDefault}
                  style={{ alignSelf: "flex-start" }}
                />
              </>
            )}
          </Card>
          {signedIn ? null : <Text variant="caption">{info.billingNote}</Text>}
        </Stack>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  connected: { flexDirection: "row", alignItems: "center", gap: space[3] },
  mark: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
