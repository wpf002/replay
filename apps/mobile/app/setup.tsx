import { AI_PROVIDERS, MODELS, type ComputerTaskDTO, type MeDTO, type ModelId } from "@relay/types";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useAiConnect } from "../src/lib/ai-connect";
import { api, ApiError } from "../src/lib/api";
import { formatPhone } from "../src/lib/format";
import { connectGoogle } from "../src/lib/google";
import { ACCESS_LABEL, MODEL_INFO, modelAccess, modelTitle } from "../src/lib/models";
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
  // People often use more than one AI, so they pick every one they want and connect them in turn.
  const [picked, setPicked] = useState<ModelId[]>([me.defaultModel]);
  const [brain, setBrain] = useState<ModelId>(me.defaultModel);
  const [queue, setQueue] = useState<ModelId[]>([]);
  const [useKey, setUseKey] = useState(false);
  const current = queue[0] ?? brain;
  const conn = useAiConnect(current, (_me, provider) => {
    // A key pasted for another provider connects that one instead.
    setPicked((list) => (list.includes(provider) ? list : [...list, provider]));
    advance();
  });
  const number = relayNumber(me.relayNumber);
  const next = () => setStep(ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)]!);

  function toggle(model: ModelId) {
    setPicked((list) => {
      const nextList = list.includes(model) ? list.filter((m) => m !== model) : [...list, model];
      if (!nextList.includes(brain) && nextList[0]) setBrain(nextList[0]);
      return nextList;
    });
  }

  /** Done with the AI at the front of the queue, on to the next. */
  function advance() {
    setUseKey(false);
    setQueue((rest) => rest.slice(1));
  }

  // Coming back from signing in to an AI account: pick up that it's connected now.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function signIntoAi() {
    setBusy(true);
    try {
      const task = await api<ComputerTaskDTO>(`/v1/ai-accounts/${current}/signin`, { body: {} });
      router.push(`/task/${task.id}`);
    } catch (err) {
      Alert.alert("Couldn't open it", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }
  const info = AI_PROVIDERS[current];
  const access = modelAccess(me, current);
  const connectedPicks = picked.filter((m) => modelAccess(me, m) === "connected");

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
      const toConnect = picked.filter((m) => modelAccess(me, m) !== "connected");
      setQueue(toConnect);
      setStep(toConnect.length || picked.length > 1 ? "key" : "contact");
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  const index = ORDER.indexOf(step);
  const footer = {
    ai: <Button label="Continue" block loading={busy} onPress={saveBrain} />,
    key: !queue.length ? (
      <Button label="Continue" block onPress={next} />
    ) : useKey ? (
      <Stack gap={2}>
        <Button
          label={`Connect ${AI_PROVIDERS[conn.provider].name}`}
          block
          loading={conn.checking}
          disabled={!conn.key || Boolean(conn.otherProvider)}
          onPress={() => void conn.connect()}
        />
        <Button label="Back" kind="ghost" block onPress={() => setUseKey(false)} />
      </Stack>
    ) : (
      <Stack gap={2}>
        <Button label={`Sign in to ${info.name}`} icon="log-in" block loading={busy} onPress={() => void signIntoAi()} />
        <Button label="Use an API key instead" kind="ghost" block onPress={() => setUseKey(true)} />
        <Button
          label={access === "included" ? `Use Relay's included ${info.name}` : queue.length > 1 ? "Skip this one" : "Skip for now"}
          kind="ghost"
          block
          onPress={advance}
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
            title="Choose your AIs"
            body="Pick every one you use. The first is your default; start a text with a prefix to use another."
          />
          <Stack gap={3}>
            {MODELS.map((m) => {
              const state = modelAccess(me, m);
              const chosen = picked.includes(m);
              return (
                <OptionCard
                  key={m}
                  multi
                  selected={chosen}
                  onPress={() => toggle(m)}
                  title={modelTitle(m)}
                  badge={state === "connected" || state === "included" ? ACCESS_LABEL[state] : MODEL_INFO[m].prefix}
                  subtitle={MODEL_INFO[m].blurb}
                  {...(chosen && picked.length > 1 ? { note: brain === m ? "Default · answers texts with no prefix" : "Tap the name to make it the default" } : {})}
                />
              );
            })}
          </Stack>
          {picked.length > 1 ? (
            <Stack gap={3}>
              <Text variant="eyebrow">Default</Text>
              <View style={styles.defaults}>
                {picked.map((m) => (
                  <Button
                    key={m}
                    label={MODEL_INFO[m].name}
                    kind={brain === m ? "primary" : "secondary"}
                    small
                    onPress={() => setBrain(m)}
                  />
                ))}
              </View>
            </Stack>
          ) : null}
        </Stack>
      ) : null}

      {step === "key" ? (
        <Stack gap={6} key="key">
          {!queue.length ? (
            <>
              <Hero
                icon="check"
                title={connectedPicks.length ? "You're connected" : "Connect them anytime"}
                body={
                  connectedPicks.length
                    ? `${connectedPicks.map((m) => MODEL_INFO[m].name).join(" and ")} ${connectedPicks.length > 1 ? "answer" : "answers"} from your own account${connectedPicks.length > 1 ? "s" : ""}.`
                    : "Settings has AI accounts whenever you want to sign in."
                }
              />
              <ListGroup>
                {MODELS.map((m) => {
                  const state = modelAccess(me, m);
                  return (
                    <ListRow
                      key={m}
                      icon={MODEL_INFO[m].icon}
                      title={MODEL_INFO[m].name}
                      subtitle={`${MODEL_INFO[m].prefix} · ${MODEL_INFO[m].blurb}`}
                      onPress={() => router.push(`/ai/${m}`)}
                      accessory={
                        <Chip label={state === "connected" ? "Connected" : "Connect"} tone={state === "connected" ? "success" : "text"} />
                      }
                    />
                  );
                })}
              </ListGroup>
            </>
          ) : (
            <>
              <Hero
                icon={useKey ? "key" : "log-in"}
                title={`Connect ${AI_PROVIDERS[conn.provider].name}`}
                body={
                  useKey
                    ? `Relay sends requests straight to the ${AI_PROVIDERS[conn.provider].company} API with your key. Nothing lands in your ${AI_PROVIDERS[conn.provider].name} history.`
                    : `Sign in once, and your texts become chats in your own ${info.name} history, answered on your ${info.planName} plan.`
                }
              />
              {queue.length > 1 ? (
                <Text variant="caption">
                  {queue.length} to go: {queue.map((m) => MODEL_INFO[m].name).join(", ")}
                </Text>
              ) : null}
              {useKey ? (
                <AiConnectForm conn={conn} />
              ) : (
                <Stack gap={4}>
                  <Point icon="message-square">Text Relay and it shows up in {info.name} like you typed it there.</Point>
                  <Point icon="credit-card">Answers come off your {info.planName} plan, not a separate API bill.</Point>
                  <Point icon="lock">You sign in yourself on the next screen. Relay never sees your password.</Point>
                </Stack>
              )}
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
  defaults: { flexDirection: "row", gap: space[2], flexWrap: "wrap" },
  contact: { flexDirection: "row", alignItems: "center", gap: space[3] },
});
