import { Redirect, router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openWeb } from "../../src/lib/relay";
import { useSession } from "../../src/lib/session";
import { space, useTheme } from "../../src/theme";
import { Appear, Button, Card, Logo, Text } from "../../src/ui";
import { Thread } from "../../src/ui/thread";

const DEMO = [
  { from: "me" as const, text: "remind me to call mom sunday at 5" },
  { from: "relay" as const, text: "Done. I'll text you Sunday at 5:00 PM." },
  { from: "me" as const, text: "@gpt make this sound less annoyed: per my last email" },
  { from: "relay" as const, text: "Just following up on my note from last week. Any update?", note: "via GPT" },
];

export default function Welcome() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ready, me } = useSession();
  if (ready && me) return <Redirect href="/(tabs)" />;

  return (
    <View style={[styles.page, { backgroundColor: colors.bg, paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[4] }]}>
      <Logo />

      <View style={styles.middle}>
        <Appear>
          <Text variant="eyebrow">Invite-only beta</Text>
        </Appear>
        <Appear delay={60}>
          <Text variant="display" style={styles.headline}>
            Text or call your AI.
          </Text>
        </Appear>
        <Appear delay={120}>
          <Text variant="body" color="textMuted">
            One phone number with Claude, GPT, and Perplexity behind it. It reads your email, adds to your calendar, sets
            reminders, and remembers what you tell it.
          </Text>
        </Appear>
        <Appear delay={200}>
          <Card style={{ marginTop: space[5] }}>
            <Thread messages={DEMO} animate baseDelay={320} />
          </Card>
        </Appear>
      </View>

      <View style={styles.actions}>
        <Button label="Get started" block onPress={() => router.push("/phone")} />
        <Button label="I already have an account" kind="ghost" block onPress={() => router.push("/phone")} />
        <Text variant="caption" center style={{ marginTop: space[2] }}>
          By continuing you agree to Relay's{" "}
          <Text variant="caption" color="text" style={styles.link} onPress={() => void openWeb("/terms")}>
            Terms
          </Text>{" "}
          and{" "}
          <Text variant="caption" color="text" style={styles.link} onPress={() => void openWeb("/privacy")}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space[4] },
  middle: { flex: 1, justifyContent: "center", gap: space[3] },
  headline: { fontSize: 40, lineHeight: 44, letterSpacing: -1.5 },
  actions: { gap: space[2] },
  link: { textDecorationLine: "underline" },
});
