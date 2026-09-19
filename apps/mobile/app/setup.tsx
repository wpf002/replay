import { AI_PROVIDERS, MODELS, type MeDTO, type ModelId } from "@relay/types";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useAiConnect } from "../src/lib/ai-connect";
import { api, ApiError } from "../src/lib/api";
import { formatPhone } from "../src/lib/format";
import { connectGoogle } from "../src/lib/google";
import { ACCESS_LABEL, MODEL_INFO, modelAccess } from "../src/lib/models";
import { openMessages, relayNumber, saveRelayContact } from "../src/lib/relay";
import { useMe, useSession } from "../src/lib/session";
import { radius, space, useTheme } from "../src/theme";
import {
  Appear,
  Button,
  Card,
  Chip,
  Icon,
  ListGroup,
  ListRow,
  LogoMark,
  OptionCard,
  Screen,
  Stack,
  Text,
  type IconName,
} from "../src/ui";
import { AiConnectForm } from "../src/ui/ai-connect-form";
import { Steps } from "../src/ui/nav";

type Step = "ai" | "key" | "contact" | "google" | "pin" | "done";
const ORDER: Step[] = ["ai", "key", "contact", "google", "pin", "done"];

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
  const [step, setStep] = useState<Step>("ai");
  const [busy, setBusy] = useState(false);
  const [brain, setBrain] = useState<ModelId>(me.defaultModel);
  const [justConnected, setJustConnected] = useState(false);
  const conn = useAiConnect(brain, (_me, provider) => {
    setBrain(provider);
    setJustConnected(true);
  });
  const number = relayNumber(me.relayNumber);
  const next = () => setStep(ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)]!);
  const brainAccess = modelAccess(me, brain);
  const brainInfo = AI_PROVIDERS[brain];

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
      // Already connected (setup reopened): nothing to paste.
      setStep(modelAccess(me, brain) === "connected" ? "contact" : "key");
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** The key they pasted belonged to another provider; that one becomes the default. */
  async function afterKey() {
    if (brain !== me.defaultModel) {
      try {
        setMe(await api<MeDTO>("/v1/me", { method: "PATCH", body: { defaultModel: brain } }));
      } catch {
        // They can change the default in Settings.
      }
    }
    next();
  }

  const index = ORDER.indexOf(step);
  const footer = {
    ai: <Button label="Continue" block loading={busy} onPress={saveBrain} />,
    key:
      justConnected || brainAccess === "connected" ? (
        <Button label="Continue" block onPress={() => void afterKey()} />
      ) : (
        <Stack gap={2}>
          <Button
            label={`Connect ${AI_PROVIDERS[conn.provider].name}`}
            block
            loading={conn.checking}
            disabled={!conn.key}
            onPress={() => void conn.connect()}
          />
          <Button
            label={brainAccess === "included" ? `Use Relay's included ${brainInfo.name}` : "Skip for now"}
            kind="ghost"
            block
            onPress={next}
          />
        </Stack>
      ),
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

      {step === "ai" ? (
        <Stack gap={6} key="ai">
          <Hero
            icon="cpu"
            title="Choose your AI"
            body="It answers your texts and calls. You can switch per message with a prefix, or connect more later."
          />
          <Stack gap={3}>
            {MODELS.map((m) => {
              const access = modelAccess(me, m);
              return (
                <OptionCard
                  key={m}
                  selected={brain === m}
                  onPress={() => setBrain(m)}
                  title={`${MODEL_INFO[m].name} · ${MODEL_INFO[m].by}`}
                  badge={access === "connected" || access === "included" ? ACCESS_LABEL[access] : MODEL_INFO[m].prefix}
                  subtitle={MODEL_INFO[m].blurb}
                />
              );
            })}
          </Stack>
        </Stack>
      ) : null}

      {step === "key" ? (
        <Stack gap={6} key="key">
          {justConnected || brainAccess === "connected" ? (
            <>
              <Hero
                icon="check"
                title={`${brainInfo.name} is connected`}
                body={`Relay answers with your ${brainInfo.company} account. Want another one for prefixes like ${AI_PROVIDERS.perplexity.prefix}?`}
              />
              <ListGroup>
                {MODELS.filter((m) => m !== brain).map((m) => {
                  const access = modelAccess(me, m);
                  return (
                    <ListRow
                      key={m}
                      icon={MODEL_INFO[m].icon}
                      title={`${MODEL_INFO[m].name}`}
                      subtitle={`${MODEL_INFO[m].prefix} · ${MODEL_INFO[m].blurb}`}
                      onPress={() => router.push(`/ai/${m}`)}
                      accessory={
                        <Chip label={access === "connected" ? "Connected" : "Connect"} tone={access === "connected" ? "success" : "text"} />
                      }
                    />
                  );
                })}
              </ListGroup>
            </>
          ) : (
            <>
              <Hero
                icon="key"
                title={`Connect ${AI_PROVIDERS[conn.provider].name}`}
                body={`Relay uses your own ${AI_PROVIDERS[conn.provider].company} API key. It takes about a minute.`}
              />
              <AiConnectForm conn={conn} />
            </>
          )}
        </Stack>
      ) : null}

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
