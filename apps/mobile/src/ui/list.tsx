import { Children, Fragment, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { radius, space, useTheme, type ColorName } from "../theme";
import { Icon, type IconName } from "./icon";
import { Divider } from "./layout";
import { Text } from "./text";

/** Inset group of rows with hairline separators, like iOS settings. */
export function ListGroup({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <Divider inset={space[4] + 32 + space[3]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

export interface ListRowProps {
  icon: IconName;
  title: string;
  subtitle?: string | null;
  value?: string | null;
  tone?: ColorName;
  onPress?: () => void;
  accessory?: ReactNode;
  /** Show a chevron when the row navigates. */
  chevron?: boolean;
}

export function ListRow({ icon, title, subtitle, value, tone = "text", onPress, accessory, chevron }: ListRowProps) {
  const { colors } = useTheme();
  const content = (
    <>
      <View style={[styles.iconBox, { backgroundColor: colors.surfaceMuted }]}>
        <Icon name={icon} size={16} tone={tone === "danger" ? "danger" : "text"} />
      </View>
      <View style={styles.text}>
        <Text variant="bodyMedium" color={tone} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="body" color="textMuted" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {accessory}
      {chevron ? <Icon name="chevron-right" size={18} tone="textMuted" /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${title}, ${value}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    minHeight: 56,
    paddingVertical: space[3],
  },
  iconBox: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 2 },
  value: { maxWidth: "45%" },
});
