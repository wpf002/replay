import type { ActionDTO, MeDTO } from "@relay/types";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError } from "../src/lib/api";
import { requireSession, useSession } from "../src/lib/session";
import { font, radius, space, useTheme } from "../src/theme";
import { Button, Icon, Text } from "../src/ui";

type Mode = "set" | "change" | "remove" | "approve";
type Stage = "current" | "new" | "confirm";

const MIN = 4;
const MAX = 8;

const FIRST_STAGE: Record<Mode, Stage> = { set: "new", change: "current", remove: "current", approve: "current" };

function prompt(mode: Mode, stage: Stage): { title: string; body: string } {
  if (stage === "current") {
    return mode === "approve"
      ? { title: "Enter your PIN", body: "This request needs your PIN before Relay runs it." }
      : { title: "Enter your current PIN", body: "To make changes, confirm it's you." };
  }
  if (stage === "new") return { title: "Choose a PIN", body: "4 to 8 digits. You'll use it on calls and for high-risk requests." };
  return { title: "Enter it again", body: "Just to be sure." };
}

function PinScreen() {
  const params = useLocalSearchParams<{ mode?: Mode; actionId?: string }>();
  const mode: Mode = params.mode ?? "set";
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { setMe } = useSession();

  const [stage, setStage] = useState<Stage>(FIRST_STAGE[mode]);
  const [pin, setPin] = useState("");
  const [current, setCurrent] = useState("");
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => setPin(""), [stage]);

  function fail(message: string) {
    setError(message);
    setPin("");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence(
      [10, -10, 8, -8, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true })),
    ).start();
  }

  function done() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  async function submit(value: string) {
    if (value.length < MIN || busy) return;
    setError(null);

    if (stage === "current" && mode === "change") {
      setCurrent(value);
      return setStage("new");
    }
    if (stage === "new") {
      setChosen(value);
      return setStage("confirm");
    }
    if (stage === "confirm" && value !== chosen) {
      setStage("new");
      return fail("Those didn't match. Choose your PIN again.");
    }

    setBusy(true);
    try {
      if (mode === "approve") {
        await api<ActionDTO>(`/v1/actions/${params.actionId}/approve`, { body: { pin: value } });
      } else if (mode === "remove") {
        setMe(await api<MeDTO>("/v1/me/pin", { method: "DELETE", body: { currentPin: value } }));
      } else {
        setMe(
          await api<MeDTO>("/v1/me/pin", {
            method: "PUT",
            body: { pin: value, ...(mode === "change" ? { currentPin: current } : {}) },
          }),
        );
      }
      done();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong.";
      if (mode === "change" && stage === "confirm") setStage("current");
      fail(message);
    } finally {
      setBusy(false);
    }
  }

  function press(key: string) {
    if (busy) return;
    void Haptics.selectionAsync();
    setError(null);
    if (key === "del") return setPin((p) => p.slice(0, -1));
    if (key === "ok") return void submit(pin);
    setPin((p) => (p.length >= MAX ? p : p + key));
  }

  const { title, body } = prompt(mode, stage);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "ok", "0", "del"];

  return (
    <View style={[styles.page, { backgroundColor: colors.bg, paddingTop: space[5], paddingBottom: insets.bottom + space[5] }]}>
      <View style={styles.top}>
        <Button label="Cancel" kind="ghost" small onPress={() => router.back()} />
      </View>

      <View style={styles.head}>
        <View style={[styles.lock, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name="lock" size={22} />
        </View>
        <Text variant="heading" center accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" color="textMuted" center style={{ maxWidth: 300 }}>
          {body}
        </Text>
      </View>

      <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]} accessibilityLabel={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(MIN, pin.length) }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: error ? colors.danger : colors.text, backgroundColor: i < pin.length ? colors.text : "transparent" },
            ]}
          />
        ))}
      </Animated.View>
      <Text variant="caption" color={error ? "danger" : "textMuted"} center style={{ minHeight: 16 }} accessibilityLiveRegion="polite">
        {error ?? (pin.length >= MIN ? "Tap ✓ when you're done" : " ")}
      </Text>

      <View style={styles.pad}>
        {keys.map((k) => {
          const isOk = k === "ok";
          const isDel = k === "del";
          const enabled = isOk ? pin.length >= MIN && !busy : isDel ? pin.length > 0 : pin.length < MAX;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityLabel={isOk ? "Done" : isDel ? "Delete" : k}
              disabled={!enabled}
              onPress={() => press(k)}
              style={({ pressed }) => [
                styles.key,
                {
                  backgroundColor: isOk ? (enabled ? colors.accent : "transparent") : isDel ? "transparent" : pressed ? colors.border : colors.surfaceMuted,
                  opacity: enabled || !isOk ? 1 : 0.3,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                },
              ]}
            >
              {isOk ? (
                <Icon name="check" size={26} color={enabled ? colors.accentFg : colors.textMuted} />
              ) : isDel ? (
                <Icon name="delete" size={24} tone={pin.length ? "text" : "textMuted"} />
              ) : (
                <Text variant="title" style={{ fontFamily: font.regular }}>
                  {k}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space[4], gap: space[5] },
  top: { flexDirection: "row", justifyContent: "flex-start" },
  head: { alignItems: "center", gap: space[3] },
  lock: { width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: space[4], marginTop: space[2] },
  dot: { width: 14, height: 14, borderRadius: radius.pill, borderWidth: 1.5 },
  pad: {
    marginTop: "auto",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: space[6],
    rowGap: space[4],
    paddingHorizontal: space[4],
  },
  key: { width: 72, height: 72, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});

export default requireSession(PinScreen);
