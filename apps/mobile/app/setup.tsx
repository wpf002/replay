import { MODELS, type MeDTO, type ModelId } from "@relay/types";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { api, ApiError } from "../src/lib/api";
import { formatPhone } from "../src/lib/format";
import { connectGoogle } from "../src/lib/google";
import { MODEL_INFO } from "../src/lib/models";
import { openMessages, relayNumber, saveRelayContact } from "../src/lib/relay";
import { useMe, useSession } from "../src/lib/session";
import { radius, space, useTheme } from "../src/theme";
import { Appear, Button, Card, Icon, LogoMark, OptionCard, Screen, Stack, Text, type IconName } from "../src/ui";
import { Steps } from "../src/ui/nav";

type Step = "contact" | "google" | "brain" | "pin" | "done";
const ORDER: Step[] = ["contact", "google", "brain", "pin", "done"];

function Hero({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <Appear style={{ gap: space[4] }}>
      <View style={[styles.heroIcon, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        <Icon name={icon} size={28} />
      </View>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" color="textMuted">
        {body}
      </Text>
    </Appear>
  );
}

function Point({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <View style={styles.point}>
      <Icon name={icon} size={18} tone="textMuted" />
      <Text variant="body" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

/** First-run setup after signup. Every step can be skipped and done later in Settings. */
export default function Setup() {
  const me = useMe();
  const { setMe, refresh } = useSession();
  const [step, setStep] = useState<Step>("contact");
  const [busy, setBusy] = useState(false);
  const [brain, setBrain] = useState<ModelId>(me.defaultModel);
  const number = relayNumber(me.relayNumber);
  const next = () => setStep(ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)]!);

  async function addContact() {
    setBusy(true);
    try {
      const result = await saveRelayContact(number);
      if (result === "denied") {
        Alert.alert("Contacts access is off", "You can add Relay yourself, or allow access in Settings.");
      }
      next();
    } catch {
      Alert.alert("Couldn't add the contact", "You can add it later from Settings.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      const result = await connectGoogle();
      if (result === "connected") {
        await refresh();
        next();
      } else if (result === "error") {
        Alert.alert("Google didn't connect", "Try again, or connect later from Settings.");
      }
    } catch (err) {
      Alert.alert("Google didn't connect", err instanceof ApiError ? err.message : "Try again later.");
    } finally {
      setBusy(false);
    }
  }

  async function saveBrain() {
    setBusy(true);
    try {
      setMe(await api<MeDTO>("/v1/me", { method: "PATCH", body: { defaultModel: brain } }));
      next();
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  const index = ORDER.indexOf(step);
  const footer = {
    contact: (
      <Stack gap={2}>
        <Button label="Add Relay to contacts" icon="user-plus" block loading={busy} onPress={addContact} />
        <Button label="Skip" kind="ghost" block onPress={next} />
      </Stack>
    ),
    google: (
      <Stack gap={2}>
        <Button label="Connect Google" block loading={busy} onPress={google} />
        <Button label="Not now" kind="ghost" block onPress={next} />
      </Stack>
    ),
    brain: <Button label="Continue" block loading={busy} onPress={saveBrain} />,
    pin: (
      <Stack gap={2}>
        <Button
          label="Set a PIN"
          block
          onPress={() => {
            next();
            router.push({ pathname: "/pin", params: { mode: "set" } });
          }}
        />
        <Button label="Skip for now" kind="ghost" block onPress={next} />
      </Stack>
    ),
    done: (
      <Stack gap={2}>
        <Button label="Text Relay" icon="message-circle" block onPress={() => void openMessages(number, "Hi Relay")} />
        <Button label="Go to home" kind="ghost" block onPress={() => router.replace("/(tabs)")} />
      </Stack>
    ),
  }[step];

  return (
    <Screen footer={footer}>
      <View style={styles.top}>
        <Steps count={ORDER.length} current={index} />
        {step !== "done" ? (
          <Button label="Skip setup" kind="ghost" small onPress={() => router.replace("/(tabs)")} />
        ) : null}
      </View>

      {step === "contact" ? (
        <Stack gap={6} key="contact">
          <Hero
            icon="user-plus"
            title="Save Relay as a contact"
            body="Texts from Relay will show up under its name instead of a number."
          />
          <Card>
            <View style={styles.contact}>
              <LogoMark size={48} />
              <View style={{ gap: 2 }}>
                <Text variant="bodyMedium">Relay</Text>
                <Text variant="mono" color="textMuted">
                  {number ? formatPhone(number) : "Number not configured"}
                </Text>
              </View>
            </View>
          </Card>
        </Stack>
      ) : null}

      {step === "google" ? (
        <Stack gap={6} key="google">
          <Hero
            icon="mail"
            title="Connect Google"
            body="Gmail and Calendar let Relay summarize your inbox, draft replies, and add events."
          />
          <Stack gap={4}>
            <Point icon="eye">Relay reads email and events only when a request needs them.</Point>
            <Point icon="check-circle">Nothing sends and no one gets an invite until you approve it.</Point>
            <Point icon="lock">Access tokens are encrypted, and you can disconnect anytime.</Point>
          </Stack>
        </Stack>
      ) : null}

      {step === "brain" ? (
        <Stack gap={6} key="brain">
          <Hero
            icon="cpu"
            title="Pick your default"
            body="This model answers texts without a prefix. Start any text with a prefix to switch for that message."
          />
          <Stack gap={3}>
            {MODELS.map((m) => (
              <OptionCard
                key={m}
                selected={brain === m}
                onPress={() => setBrain(m)}
                title={MODEL_INFO[m].name}
                badge={MODEL_INFO[m].prefix}
                subtitle={MODEL_INFO[m].blurb}
              />
            ))}
          </Stack>
        </Stack>
      ) : null}

      {step === "pin" ? (
        <Stack gap={6} key="pin">
          <Hero
            icon="key"
            title="Set a PIN"
            body="Caller ID can be faked, so Relay asks for your PIN on calls before it sends anything or opens your email."
          />
          <Stack gap={4}>
            <Point icon="phone">Say it or type it on the keypad during a call.</Point>
            <Point icon="shield">High-risk requests, like Relay calling a business, need it by text too.</Point>
          </Stack>
        </Stack>
      ) : null}

      {step === "done" ? (
        <Stack gap={6} key="done">
          <Hero icon="check" title="You're set" body="Text Relay like you'd text a friend. A few things to try:" />
          <Stack gap={3}>
            {[
              "remind me to call mom sunday at 5",
              "what's on my calendar tomorrow?",
              "@web is the DMV open saturday?",
              "email Sam that I'm running 10 min late",
            ].map((t, i) => (
              <Appear key={t} delay={i * 80}>
                <Card style={{ paddingVertical: space[3] }}>
                  <Text variant="mono">{t}</Text>
                </Card>
              </Appear>
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  point: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  contact: { flexDirection: "row", alignItems: "center", gap: space[3] },
});
