import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import { MODELS } from "@relay/types";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { api, ApiError } from "../../src/lib/api";
import { dollars, formatPhone, initials } from "../../src/lib/format";
import { connectGoogle, disconnectGoogle } from "../../src/lib/google";
import { MODEL_INFO, modelAccess } from "../../src/lib/models";
import { openMessages, openWeb, relayNumber, saveRelayContact } from "../../src/lib/relay";
import { useMe, useSession } from "../../src/lib/session";
import { radius, space, useTheme } from "../../src/theme";
import { Button, Card, Chip, ListGroup, ListRow, Screen, Section, Stack, Text } from "../../src/ui";

export default function Settings() {
  const me = useMe();
  const { refresh, signOut } = useSession();
  const { colors } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const number = relayNumber(me.relayNumber);

  // Settings can change elsewhere (the web account page); show the current values.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      Alert.alert("That didn't work", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(null);
    }
  }

  const google = () =>
    run("google", async () => {
      if (me.google.connected && !me.google.missingScopes) {
        Alert.alert("Disconnect Google?", "Relay loses access to Gmail and Calendar, and your tokens are deleted.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: () => void run("google", async () => {
              await disconnectGoogle();
              await refresh();
            }),
          },
        ]);
        return;
      }
      const result = await connectGoogle();
      if (result === "error") Alert.alert("Google didn't connect", "Try again in a moment.");
      await refresh();
    });

  const contact = () =>
    run("contact", async () => {
      const result = await saveRelayContact(number);
      Alert.alert(
        result === "denied" ? "Contacts access is off" : result === "exists" ? "Already saved" : "Saved",
        result === "denied"
          ? "Allow contacts access in Settings, or add the number yourself."
          : "Texts from Relay show up under its name.",
      );
    });

  const signOutSites = () =>
    Alert.alert("Sign out of all sites?", "Relay's browser forgets every site you signed in to. Tasks will ask you to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => void run("sites", async () => {
          await api("/v1/computer/profile", { method: "DELETE" });
          Alert.alert("Signed out", "Relay's browser is signed out of every site.");
        }),
      },
    ]);

  const signOutEverywhere = () =>
    Alert.alert("Sign out everywhere?", "Every device signed in to Relay, including this one, will need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => void run("all", async () => {
          await api("/v1/auth/logout-all", { body: {} });
          await signOut();
          router.replace("/welcome");
        }),
      },
    ]);

  const deleteAccount = () =>
    Alert.alert(
      "Delete your account?",
      "This deletes your messages, memories, reminders, and connected accounts, and revokes Google access. It can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void run("delete", async () => {
            await api("/v1/me", { method: "DELETE" });
            await signOut();
            router.replace("/welcome");
          }),
        },
      ],
    );

  return (
    <Screen onRefresh={() => void refresh()}>
      <Text variant="title" accessibilityRole="header">
        Settings
      </Text>

      <Pressable accessibilityRole="button" accessibilityLabel="Edit your name" onPress={() => router.push("/profile")}>
        <Card style={styles.profile}>
          <View style={[styles.avatar, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <Text variant="heading">{initials(me.name)}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{me.name ?? "Add your name"}</Text>
            <Text variant="body" color="textMuted">
              {formatPhone(me.phone)}
            </Text>
          </View>
          <Text variant="caption">Edit</Text>
        </Card>
      </Pressable>

      {me.smsOptedOut ? (
        <Card style={{ gap: space[2] }}>
          <Text variant="bodyMedium">Texts are paused</Text>
          <Text variant="body" color="textMuted">
            You replied STOP, so Relay can't text you. Text START to Relay to turn texts back on.
          </Text>
          <Button label="Text START" kind="secondary" small onPress={() => void openMessages(number, "START")} style={{ alignSelf: "flex-start" }} />
        </Card>
      ) : null}

      <Section title="AI accounts">
        <ListGroup>
          {MODELS.map((m) => {
            const access = modelAccess(me, m);
            const account = me.aiAccounts.find((a) => a.provider === m);
            return (
              <ListRow
                key={m}
                icon={MODEL_INFO[m].icon}
                title={MODEL_INFO[m].name}
                subtitle={
                  access === "connected"
                    ? `${account?.mode === "browser" ? "Signed in to your account" : `Your ${MODEL_INFO[m].by} key ${account?.hint ?? ""}`}${me.defaultModel === m ? " · Default" : ""}`
                    : access === "invalid"
                      ? "Key stopped working. Tap to update it."
                      : access === "included"
                        ? `Included up to a daily limit${me.defaultModel === m ? " · Default" : ""}`
                        : `Sign in so ${MODEL_INFO[m].prefix} uses your account`
                }
                onPress={() => router.push(`/ai/${m}`)}
                accessory={
                  access === "connected" ? (
                    <Chip label="Connected" tone="success" />
                  ) : access === "invalid" ? (
                    <Chip label="Fix" tone="danger" />
                  ) : (
                    <Chip label="Connect" tone="text" />
                  )
                }
              />
            );
          })}
        </ListGroup>
      </Section>

      <Section title="Relay">
        <ListGroup>
          <ListRow
            icon="cpu"
            title="Default model"
            value={MODEL_INFO[me.defaultModel].name}
            onPress={() => router.push("/model")}
            chevron
          />
          <ListRow icon="globe" title="Time zone" value={me.timezone.replace(/_/g, " ")} onPress={() => router.push("/timezone")} chevron />
          <ListRow
            icon="user-plus"
            title="Save Relay to contacts"
            subtitle={number ? formatPhone(number) : undefined}
            onPress={contact}
            accessory={busy === "contact" ? <Chip label="Saving" /> : undefined}
          />
        </ListGroup>
      </Section>

      <Section title="Connections">
        <ListGroup>
          <ListRow
            icon="mail"
            title="Google"
            subtitle={
              me.google.connected
                ? me.google.missingScopes
                  ? "Missing Gmail or Calendar permission. Tap to reconnect."
                  : `Gmail and Calendar · ${me.google.email ?? "connected"}`
                : "Gmail and Calendar"
            }
            onPress={google}
            accessory={
              busy === "google" ? (
                <Chip label="Working" />
              ) : me.google.connected && !me.google.missingScopes ? (
                <Chip label="Connected" tone="success" />
              ) : (
                <Chip label="Connect" tone="text" />
              )
            }
          />
        </ListGroup>
      </Section>

      <Section title="Relay's browser">
        <ListGroup>
          <ListRow
            icon="log-in"
            title="Sign in to a site"
            subtitle="So Relay can book and order with your accounts"
            onPress={() => router.push("/browser-signin")}
            chevron
          />
          <ListRow icon="log-out" title="Sign out of all sites" onPress={signOutSites} accessory={busy === "sites" ? <Chip label="Working" /> : undefined} />
        </ListGroup>
      </Section>

      <Section title="Security">
        <ListGroup>
          <ListRow
            icon="key"
            title={me.hasPin ? "Change PIN" : "Set a PIN"}
            subtitle={me.pinLocked ? "Locked for an hour after too many wrong tries" : "Required on calls and for high-risk requests"}
            onPress={() => router.push({ pathname: "/pin", params: { mode: me.hasPin ? "change" : "set" } })}
            chevron
          />
          {me.hasPin ? (
            <ListRow icon="x-circle" title="Remove PIN" onPress={() => router.push({ pathname: "/pin", params: { mode: "remove" } })} chevron />
          ) : null}
          <ListRow icon="log-out" title="Sign out everywhere" onPress={signOutEverywhere} />
        </ListGroup>
      </Section>

      <Section title="Your data">
        <ListGroup>
          <ListRow icon="bookmark" title="Memories" value={String(me.counts.memories)} onPress={() => router.push("/memories")} chevron />
          <ListRow icon="bell" title="Reminders" value={String(me.counts.upcomingReminders)} onPress={() => router.push("/reminders")} chevron />
          <ListRow icon="activity" title="Usage today" value={`${dollars(me.usage.spentCents)} / ${dollars(me.usage.capCents)}`} />
        </ListGroup>
      </Section>

      <Section title="Help">
        <ListGroup>
          <ListRow icon="help-circle" title="Text HELP" subtitle="Program info and support contact" onPress={() => void openMessages(number, "HELP")} />
          <ListRow icon="shield" title="Privacy Policy" onPress={() => void openWeb("/privacy")} chevron />
          <ListRow icon="file-text" title="Terms of Service" onPress={() => void openWeb("/terms")} chevron />
        </ListGroup>
      </Section>

      <Stack gap={2}>
        <Button label="Sign out" kind="secondary" block onPress={() => void signOut().then(() => router.replace("/welcome"))} />
        <Button label="Delete account" kind="danger" block loading={busy === "delete"} onPress={deleteAccount} />
        <Text variant="caption" center style={{ marginTop: space[2] }}>
          Relay {Constants.expoConfig?.version ?? ""}
        </Text>
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: space[3] },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
