import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, useTheme } from "../theme";
import { Text } from "./text";

/** Scrollable page with safe-area padding and the app background. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  keyboard,
  footer,
  contentStyle,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Lift content above the keyboard (forms). */
  keyboard?: boolean;
  /** Pinned below the scroll area, e.g. a primary button. */
  footer?: ReactNode;
  contentStyle?: ViewStyle;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const body = (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[4], paddingBottom: footer ? space[5] : insets.bottom + space[7] },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.textMuted} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {/* Keeps scrolled content from running under the status bar. */}
      <View pointerEvents="none" style={[styles.statusBar, { height: insets.top, backgroundColor: colors.bg }]} />
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[4], borderTopColor: colors.border, backgroundColor: colors.bg }]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
  if (!keyboard) return body;
  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {body}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        padded && { padding: space[4] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Section({
  title,
  action,
  children,
  style,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <View style={styles.sectionHead}>
          <Text variant="eyebrow">{title}</Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Stack({ gap = 4, children, style }: { gap?: keyof typeof space; children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ gap: space[gap] }, style]}>{children}</View>;
}

export function Row({ gap = 3, children, style }: { gap?: keyof typeof space; children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, { gap: space[gap] }, style]}>{children}</View>;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  statusBar: { position: "absolute", top: 0, left: 0, right: 0 },
  content: { paddingHorizontal: space[4], gap: space[6] },
  footer: { paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  card: { borderWidth: 1, borderRadius: radius.md },
  section: { gap: space[3] },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center" },
});
