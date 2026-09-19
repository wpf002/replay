import type { ComputerInput, ComputerKey, ComputerTaskDTO } from "@relay/types";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { api, ApiError } from "../../src/lib/api";
import { clockTime } from "../../src/lib/format";
import { hostOf, isActive, taskStatus, useLive } from "../../src/lib/tasks";
import { font, radius, size, space, useTheme } from "../../src/theme";
import { Button, Card, ErrorBanner, Field, Icon, Screen, Stack, Text, type IconName } from "../../src/ui";
import { ApprovalCard } from "../../src/ui/approval-card";
import { BrowserView } from "../../src/ui/browser-view";
import { PageHeader } from "../../src/ui/nav";

const STEP_ICON: Record<string, IconName> = {
  action: "mouse-pointer",
  note: "message-square",
  approval: "check-circle",
  handoff: "user",
  question: "help-circle",
  answer: "corner-down-right",
  result: "flag",
};

const KEYS: { key: ComputerKey; icon: IconName; label: string }[] = [
  { key: "Enter", icon: "corner-down-left", label: "Enter" },
  { key: "Tab", icon: "arrow-right", label: "Tab" },
  { key: "Backspace", icon: "delete", label: "Delete" },
];

function KeyButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        { borderColor: colors.borderStrong, backgroundColor: pressed ? colors.surfaceMuted : colors.surface },
      ]}
    >
      <Icon name={icon} size={18} />
    </Pressable>
  );
}

/** Someone taps and types on Relay's browser from their phone: sign-ins, codes, CAPTCHAs. */
function TakeoverControls({ send }: { send: (input: ComputerInput) => Promise<void> }) {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState(true);

  async function typeIt() {
    if (!text) return;
    const value = text;
    setText("");
    await send({ type: "type", text: value });
  }

  return (
    <Card style={{ gap: space[3] }}>
      <Text variant="caption">Tap the page to click. Type below and press Send. Relay doesn't see or save what you type.</Text>
      <View style={styles.typeRow}>
        <View style={[styles.typeBox, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type into the page"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={hidden}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            onSubmitEditing={() => void typeIt()}
            returnKeyType="send"
            style={[styles.typeInput, { color: colors.text }]}
            accessibilityLabel="Text to type into the page"
          />
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? "Show text" : "Hide text"} onPress={() => setHidden(!hidden)} hitSlop={8}>
            <Icon name={hidden ? "eye" : "eye-off"} size={18} tone="textMuted" />
          </Pressable>
        </View>
        <Button label="Send" small onPress={() => void typeIt()} disabled={!text} />
      </View>
      <View style={styles.keys}>
        {KEYS.map((k) => (
          <KeyButton key={k.key} icon={k.icon} label={k.label} onPress={() => void send({ type: "key", key: k.key })} />
        ))}
        <KeyButton icon="chevrons-up" label="Scroll up" onPress={() => void send({ type: "scroll", direction: "up" })} />
        <KeyButton icon="chevrons-down" label="Scroll down" onPress={() => void send({ type: "scroll", direction: "down" })} />
        <KeyButton icon="arrow-left" label="Back" onPress={() => void send({ type: "back" })} />
      </View>
    </Card>
  );
}

function AnswerBox({ taskId, onSent }: { taskId: string; onSent: () => void }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await api(`/v1/computer/tasks/${taskId}/answer`, { body: { text: answer } });
      setAnswer("");
      onSent();
    } catch (err) {
      Alert.alert("Didn't send", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap={2}>
      <Field value={answer} onChangeText={setAnswer} placeholder="Your answer" returnKeyType="send" onSubmitEditing={() => void send()} />
      <Button label="Send answer" small loading={busy} disabled={!answer.trim()} onPress={() => void send()} style={{ alignSelf: "flex-start" }} />
    </Stack>
  );
}

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const task = useLive<ComputerTaskDTO>(`/v1/computer/tasks/${id}`, 1500, isActive);
  const t = task.data;
  const [busy, setBusy] = useState(false);

  const takeover = t?.state === "waiting_user" && t.waitingKind === "takeover";
  const status = t ? taskStatus(t) : null;

  async function send(input: ComputerInput) {
    try {
      void Haptics.selectionAsync();
      await api(`/v1/computer/tasks/${id}/input`, { body: input });
      setTimeout(() => void task.refresh(), 400);
    } catch (err) {
      Alert.alert("That didn't reach the browser", err instanceof ApiError ? err.message : "Try again.");
    }
  }

  async function post(path: string) {
    setBusy(true);
    try {
      await api(`/v1/computer/tasks/${id}/${path}`, { body: {} });
      await task.refresh();
    } catch (err) {
      Alert.alert("That didn't work", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  const stop = () =>
    Alert.alert("Stop this task?", "Relay closes the browser. Nothing that needs your OK has happened yet.", [
      { text: "Keep going", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: () => void post("cancel") },
    ]);

  const footer = !t ? null : takeover ? (
    <Button
      label={t.mode === "signin" ? "I'm signed in" : "Done, hand it back"}
      icon="check"
      block
      loading={busy}
      onPress={() => void post("resume")}
    />
  ) : isActive(t) ? (
    <Button label="Stop task" kind="secondary" block loading={busy} onPress={stop} />
  ) : null;

  return (
    <Screen footer={footer} keyboard>
      <PageHeader
        back
        eyebrow={t?.mode === "signin" ? "Sign in" : "Relay's browser"}
        title={t ? (t.mode === "signin" ? t.goal : status!.label) : "Loading"}
        body={t && t.mode === "browse" ? t.goal : undefined}
      />

      {task.error && !t ? <ErrorBanner message={task.error} onRetry={() => void task.refresh()} /> : null}

      {t ? (
        <>
          {t.state === "waiting_user" && t.waitingFor ? (
            <Card style={{ ...styles.callout, borderColor: colors.accent }}>
              <Icon name={takeover ? "user" : "help-circle"} size={20} />
              <Text variant="bodyMedium" style={{ flex: 1 }}>
                {t.waitingFor}
              </Text>
            </Card>
          ) : null}

          {t.state === "waiting_approval" && t.action ? <ApprovalCard action={t.action} onChange={() => void task.refresh()} /> : null}

          {t.state === "waiting_user" && t.waitingKind === "answer" ? <AnswerBox taskId={t.id} onSent={() => void task.refresh()} /> : null}

          {isActive(t) || t.screenVersion ? (
            <BrowserView
              taskId={t.id}
              version={t.screenVersion}
              url={t.url}
              live={isActive(t)}
              takeover={takeover}
              onTap={(x, y) => void send({ type: "click", x, y })}
            />
          ) : null}

          {takeover ? <TakeoverControls send={send} /> : null}

          {!isActive(t) && t.summary ? (
            <Card style={{ gap: space[2] }}>
              <Text variant="eyebrow">{status!.label}</Text>
              <Text variant="body">{t.summary}</Text>
            </Card>
          ) : null}

          {t.steps.length ? (
            <Stack gap={3}>
              <Text variant="eyebrow">Activity</Text>
              {[...t.steps].reverse().map((s) => (
                <View key={s.id} style={styles.step}>
                  <View style={[styles.stepIcon, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Icon name={STEP_ICON[s.kind] ?? "circle"} size={14} tone="textMuted" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="body">{s.text}</Text>
                    <Text variant="caption">{clockTime(s.createdAt)}</Text>
                  </View>
                </View>
              ))}
            </Stack>
          ) : null}

          {hostOf(t.url) && !isActive(t) ? (
            <Text variant="caption">Last page: {hostOf(t.url)}</Text>
          ) : null}
        </>
      ) : null}

      {!t && !task.error ? (
        <View style={{ paddingVertical: space[7] }}>
          <Text variant="caption" center>
            Loading…
          </Text>
        </View>
      ) : null}
      {takeover ? null : <View style={{ height: space[2] }} />}
      {t && !isActive(t) ? <Button label="Done" kind="ghost" block onPress={() => router.back()} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  callout: { flexDirection: "row", alignItems: "center", gap: space[3], borderWidth: 2 },
  typeRow: { flexDirection: "row", gap: space[2], alignItems: "center" },
  typeBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    height: 40,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
  },
  typeInput: { flex: 1, fontFamily: font.regular, fontSize: size.base, paddingVertical: 0 },
  keys: { flexDirection: "row", gap: space[2], flexWrap: "wrap" },
  key: {
    width: 48,
    height: 40,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  step: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
