import type { ComputerTaskDTO } from "@relay/types";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { api, ApiError } from "../src/lib/api";
import { space } from "../src/theme";
import { Button, Card, Field, Icon, Screen, Text } from "../src/ui";
import { PageHeader } from "../src/ui/nav";


/** Opens a site in Relay's browser so the person signs in once and tasks can use the account. */
export default function BrowserSignin() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function open(target: string, key: string) {
    setBusy(key);
    try {
      const task = await api<ComputerTaskDTO>("/v1/computer/signin", { body: { url: target } });
      router.replace(`/task/${task.id}`);
    } catch (err) {
      Alert.alert("Couldn't open it", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      keyboard
      footer={<Button label="Open" block loading={busy === "custom"} disabled={url.trim().length < 3} onPress={() => void open(url.trim(), "custom")} />}
    >
      <PageHeader
        back
        title="Sign in to a site"
        body="Relay books and orders with your own accounts. Sign in once in Relay's browser and it stays signed in."
      />
      <Field
        label="Website"
        value={url}
        onChangeText={setUrl}
        placeholder="instacart.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={() => url.trim().length >= 3 && void open(url.trim(), "custom")}
      />
      <Card style={styles.note}>
        <Icon name="shield" size={18} tone="textMuted" />
        <Text variant="caption" style={{ flex: 1 }}>
          You type your password yourself, straight into the site. Relay never sees it, and it asks your OK before it buys or books anything. Settings has Sign out of all sites.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: "row", gap: space[3] },
});
