import { COMPUTER_VIEWPORT, TAKEOVER_VIEWPORT } from "@relay/types";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { authHeaders } from "../lib/api";
import { hostOf, screenUrl } from "../lib/tasks";
import { font, radius, size, space, useTheme } from "../theme";
import { Icon } from "./icon";
import { Text } from "./text";

/**
 * Relay's browser as the person sees it: an address bar and the latest screenshot. In take-over
 * mode, taps go to the page at the matching point.
 */
export function BrowserView({
  taskId,
  version,
  url,
  live,
  takeover,
  onTap,
}: {
  taskId: string;
  version: string | null;
  url: string | null;
  live: boolean;
  takeover: boolean;
  onTap?: (x: number, y: number) => void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const page = takeover ? TAKEOVER_VIEWPORT : COMPUTER_VIEWPORT;
  const height = width ? (width * page.height) / page.width : 0;
  const host = hostOf(url);

  return (
    <View style={[styles.frame, { borderColor: takeover ? colors.accent : colors.border, backgroundColor: colors.surface }]}>
      <View style={[styles.bar, { borderBottomColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
        <Icon name="lock" size={12} tone="textMuted" />
        <Text variant="caption" numberOfLines={1} style={[styles.host, { color: colors.text }]}>
          {host ?? "Relay's browser"}
        </Text>
        {live ? <View style={[styles.dot, { backgroundColor: takeover ? colors.accent : colors.success }]} /> : null}
      </View>
      <Pressable
        disabled={!takeover || !onTap || !width}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (!width || !onTap) return;
          const scale = page.width / width;
          onTap(Math.round(e.nativeEvent.locationX * scale), Math.round(e.nativeEvent.locationY * scale));
        }}
        accessibilityRole={takeover ? "button" : "image"}
        accessibilityLabel={takeover ? "Relay's browser. Tap to click on the page." : `Relay's browser on ${host ?? "a page"}`}
        style={{ height: height || 200 }}
      >
        {version ? (
          <Image
            source={{ uri: screenUrl(taskId, version), headers: authHeaders() }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={120}
            cachePolicy="memory"
          />
        ) : (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.textMuted} />
            <Text variant="caption">Opening Relay's browser…</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    height: 32,
    borderBottomWidth: 1,
  },
  host: { flex: 1, fontFamily: font.mono, fontSize: size.sm },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: space[2] },
});
