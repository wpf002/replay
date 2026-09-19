import { AI_PROVIDERS } from "@relay/types";
import * as Clipboard from "expo-clipboard";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { AiConnect } from "../lib/ai-connect";
import { radius, space, useTheme } from "../theme";
import { Button } from "./button";
import { Field } from "./field";
import { Icon } from "./icon";
import { Card, Stack } from "./layout";
import { Text } from "./text";

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.step}>
      <View style={[styles.num, { borderColor: colors.borderStrong }]}>
        <Text variant="mono">{n}</Text>
      </View>
      <View style={{ flex: 1, gap: space[3] }}>
        <View style={{ gap: space[1] }}>
          <Text variant="bodyMedium">{title}</Text>
          <Text variant="body" color="textMuted">
            {body}
          </Text>
        </View>
        {children}
      </View>
    </View>
  );
}

/** iOS 16+ gets the system paste control, which pastes without the "Allow Paste" prompt. */
function PasteButton({ onPaste, disabled }: { onPaste: (text: string) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  if (Clipboard.isPasteButtonAvailable) {
    return (
      <Clipboard.ClipboardPasteButton
        onPress={(data) => {
          if (data.type === "text") onPaste(data.text);
        }}
        acceptedContentTypes={["plain-text"]}
        displayMode="iconAndLabel"
        cornerStyle="medium"
        backgroundColor={colors.text}
        foregroundColor={colors.bg}
        style={styles.paste}
        accessibilityLabel="Paste key"
      />
    );
  }
  return (
    <Button
      label="Paste"
      icon="clipboard"
      kind="secondary"
      disabled={disabled}
      onPress={() => void Clipboard.getStringAsync().then(onPaste)}
      style={styles.paste}
    />
  );
}

/** Two steps: open the provider's key page in an in-app browser, then paste the key. */
export function AiConnectForm({ conn }: { conn: AiConnect }) {
  const { colors } = useTheme();
  const info = AI_PROVIDERS[conn.provider];
  const other = conn.otherProvider ? AI_PROVIDERS[conn.otherProvider] : null;
  const fieldError = conn.error && !conn.error.reason?.startsWith("wrong_provider") ? conn.error.message : null;

  return (
    <Stack gap={5}>
      <Card style={{ gap: space[5] }}>
        <Step n={1} title={`Create a key at ${info.company}`} body={`Sign in, create an API key, and name it Relay.`}>
          <Button
            label={`Open ${info.company}`}
            icon="external-link"
            kind="secondary"
            small
            onPress={() => void conn.openKeyPage()}
            style={{ alignSelf: "flex-start" }}
          />
        </Step>
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <Step
          n={2}
          title="Paste it here"
          body={conn.visitedKeyPage ? "Copied it? Tap Paste." : "Copy the key, come back, and paste."}
        >
          <View style={styles.pasteRow}>
            <View style={{ flex: 1 }}>
              <Field
                value={conn.key}
                onChangeText={conn.setKey}
                placeholder={`${info.keyPrefix}…`}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                spellCheck={false}
                returnKeyType="done"
                editable={!conn.checking}
                onSubmitEditing={() => void conn.connect()}
                accessibilityLabel={`${info.name} API key`}
                error={fieldError}
              />
            </View>
            <PasteButton onPaste={conn.paste} disabled={conn.checking} />
          </View>
        </Step>
      </Card>

      {other && conn.otherProvider ? (
        <Card style={{ gap: space[3] }}>
          <Text variant="body">
            That looks like a {other.name} key, not {info.name}.
          </Text>
          <Button
            label={`Connect it as ${other.name}`}
            kind="secondary"
            small
            loading={conn.checking}
            onPress={() => void conn.connect(conn.otherProvider!)}
            style={{ alignSelf: "flex-start" }}
          />
        </Card>
      ) : null}

      {conn.error?.reason === "no_credit" ? (
        <Button
          label={`Add credit at ${info.company}`}
          icon="credit-card"
          kind="secondary"
          onPress={() => void conn.openBilling()}
        />
      ) : null}

      <Stack gap={3}>
        <View style={styles.note}>
          <Icon name="lock" size={16} tone="textMuted" />
          <Text variant="caption" style={{ flex: 1 }}>
            Relay encrypts your key and only sends it to {info.company}. Remove it anytime.
          </Text>
        </View>
        <View style={styles.note}>
          <Icon name="credit-card" size={16} tone="textMuted" />
          <Text variant="caption" style={{ flex: 1 }}>
            {info.billingNote}
          </Text>
        </View>
      </Stack>
    </Stack>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  num: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rule: { height: 1, marginLeft: 40 },
  pasteRow: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  paste: { width: 96, height: 48 },
  note: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
});
