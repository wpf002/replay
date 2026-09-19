import type { ActionDTO } from "@relay/types";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { actionMeta, STATE_LABEL } from "../../src/lib/actions";
import { dollars, formatPhone, greeting, initials } from "../../src/lib/format";
import { callRelay, openMessages, relayNumber } from "../../src/lib/relay";
import { useMe, useSession } from "../../src/lib/session";
import { useApi } from "../../src/lib/use-api";
import { font, radius, space, useTheme } from "../../src/theme";
import {
  Appear,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  ListGroup,
  ListRow,
  LogoMark,
  ProgressBar,
  Screen,
  Section,
  Stack,
  Text,
} from "../../src/ui";
import { ApprovalCard } from "../../src/ui/approval-card";

export default function Home() {
  const me = useMe();
  const { refresh: refreshMe } = useSession();
  const { colors } = useTheme();
  const actions = useApi<{ pending: ActionDTO[]; recent: ActionDTO[] }>("/v1/actions");
  const number = relayNumber(me.relayNumber);
  const pending = actions.data?.pending ?? [];
  const recent = (actions.data?.recent ?? []).slice(0, 4);
  const firstName = me.name?.split(" ")[0];

  const reload = async () => {
    await Promise.all([actions.refresh(), refreshMe()]);
  };

  // Counts and the tab badge come from /v1/me; keep them current whenever Home is shown.
  useFocusEffect(
    useCallback(() => {
      void refreshMe();
    }, [refreshMe]),
  );

  const todo = [
    !me.google.connected && {
      icon: "mail" as const,
      title: "Connect Google",
      subtitle: "So Relay can help with email and your calendar",
      onPress: () => router.push("/(tabs)/settings"),
    },
    me.google.connected &&
      me.google.missingScopes && {
        icon: "alert-circle" as const,
        title: "Reconnect Google",
        subtitle: "Relay is missing Gmail or Calendar permission",
        onPress: () => router.push("/(tabs)/settings"),
      },
    !me.hasPin && {
      icon: "key" as const,
      title: "Set a PIN",
      subtitle: "Needed on calls before Relay sends or reads anything",
      onPress: () => router.push({ pathname: "/pin", params: { mode: "set" } }),
    },
  ].filter(Boolean) as { icon: "mail" | "alert-circle" | "key"; title: string; subtitle: string; onPress: () => void }[];

  return (
    <Screen refreshing={actions.refreshing} onRefresh={reload}>
      <View style={styles.top}>
        <LogoMark size={32} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/(tabs)/settings")}
          style={[styles.avatar, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
        >
          <Text variant="bodyMedium">{initials(me.name)}</Text>
        </Pressable>
      </View>

      <Appear>
        <Text variant="title">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </Text>
      </Appear>

      <Appear delay={60}>
        <Card style={{ gap: space[4] }}>
          <View style={{ gap: space[1] }}>
            <Text variant="eyebrow">Your Relay line</Text>
            <Text variant="title" style={{ fontFamily: font.monoMedium, letterSpacing: -0.5 }} selectable>
              {number ? formatPhone(number) : "Not configured"}
            </Text>
            <Text variant="caption">Text or call it from your phone. Start a text with @gpt or @web to switch models.</Text>
          </View>
          <View style={styles.buttons}>
            <Button label="Text" icon="message-circle" style={styles.flex} onPress={() => void openMessages(number)} />
            <Button label="Call" icon="phone" kind="secondary" style={styles.flex} onPress={() => void callRelay(number)} />
          </View>
        </Card>
      </Appear>

      {actions.error ? <ErrorBanner message={actions.error} onRetry={reload} /> : null}

      <Section
        title="Needs your OK"
        action={pending.length ? <Chip label={`${pending.length} waiting`} tone="text" /> : undefined}
      >
        {pending.length ? (
          <Stack gap={3}>
            {pending.map((a, i) => (
              <Appear key={a.id} delay={i * 60}>
                <ApprovalCard action={a} onChange={reload} />
              </Appear>
            ))}
          </Stack>
        ) : (
          <EmptyState
            icon="check-circle"
            title="Nothing waiting"
            body="When Relay drafts an email, an invite, or a call for you, it shows up here to approve."
          />
        )}
      </Section>

      {todo.length ? (
        <Section title="Finish setting up">
          <ListGroup>
            {todo.map((t) => (
              <ListRow key={t.title} icon={t.icon} title={t.title} subtitle={t.subtitle} onPress={t.onPress} chevron />
            ))}
          </ListGroup>
        </Section>
      ) : null}

      <Section title="Today">
        <View style={styles.tiles}>
          <Pressable style={styles.flex} onPress={() => router.push("/reminders")} accessibilityRole="button" accessibilityLabel={`${me.counts.upcomingReminders} reminders`}>
            <Card style={styles.tile}>
              <Text variant="title">{me.counts.upcomingReminders}</Text>
              <Text variant="caption">Reminders</Text>
            </Card>
          </Pressable>
          <Pressable style={styles.flex} onPress={() => router.push("/memories")} accessibilityRole="button" accessibilityLabel={`${me.counts.memories} memories`}>
            <Card style={styles.tile}>
              <Text variant="title">{me.counts.memories}</Text>
              <Text variant="caption">Memories</Text>
            </Card>
          </Pressable>
        </View>
        <Card style={{ gap: space[2] }}>
          <View style={styles.usageHead}>
            <Text variant="bodyMedium">Usage</Text>
            <Text variant="caption" style={{ fontVariant: ["tabular-nums"] }}>
              {dollars(me.usage.spentCents)} of {dollars(me.usage.capCents)} today
            </Text>
          </View>
          <ProgressBar value={me.usage.spentCents / Math.max(1, me.usage.capCents)} />
        </Card>
      </Section>

      {recent.length ? (
        <Section title="Recent actions">
          <ListGroup>
            {recent.map((a) => (
              <ListRow
                key={a.id}
                icon={actionMeta(a).icon}
                title={actionMeta(a).label}
                subtitle={a.error ?? a.summary.split("\n")[0]}
                accessory={<Chip label={STATE_LABEL[a.state]} tone={a.state === "failed" ? "danger" : "textMuted"} />}
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttons: { flexDirection: "row", gap: space[2] },
  flex: { flex: 1 },
  tiles: { flexDirection: "row", gap: space[3] },
  tile: { gap: space[1] },
  usageHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
