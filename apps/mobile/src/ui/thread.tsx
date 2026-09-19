import { StyleSheet, View } from "react-native";
import { radius, space, useTheme } from "../theme";
import { Appear } from "./bits";
import { Text } from "./text";

export interface Bubble {
  from: "me" | "relay" | "other";
  text: string;
  note?: string;
}

/** An SMS-style exchange. "me" is the user; "other" is a business on a call Relay placed. */
export function Thread({ messages, animate, baseDelay = 0 }: { messages: Bubble[]; animate?: boolean; baseDelay?: number }) {
  return (
    <View style={styles.thread}>
      {messages.map((m, i) => {
        const bubble = <BubbleView key={i} {...m} />;
        return animate ? (
          <Appear key={i} delay={baseDelay + i * 140}>
            {bubble}
          </Appear>
        ) : (
          bubble
        );
      })}
    </View>
  );
}

export function BubbleView({ from, text, note }: Bubble) {
  const { colors } = useTheme();
  const mine = from === "me";
  return (
    <View style={[styles.wrap, mine ? styles.right : styles.left]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: colors.text, borderBottomRightRadius: 4 }
            : {
                backgroundColor: from === "other" ? colors.surface : colors.surfaceMuted,
                borderBottomLeftRadius: 4,
                borderWidth: from === "other" ? 1 : 0,
                borderColor: colors.border,
              },
        ]}
      >
        <Text variant="body" style={{ color: mine ? colors.bg : colors.text, lineHeight: 22 }}>
          {text}
        </Text>
      </View>
      {note ? (
        <Text variant="caption" style={styles.note}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { gap: space[2] },
  wrap: { maxWidth: "84%", gap: space[1] },
  left: { alignSelf: "flex-start", alignItems: "flex-start" },
  right: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubble: { paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.md },
  note: { paddingHorizontal: space[1] },
});
