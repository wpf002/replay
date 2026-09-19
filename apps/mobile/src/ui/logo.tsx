import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { space, useTheme } from "../theme";
import { Text } from "./text";

export function LogoMark({ size = 32 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityElementsHidden importantForAccessibility="no">
      <Rect width={32} height={32} rx={8} fill={colors.accent} />
      <Path
        d="M8 11a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6.2l-4.3 3.4c-.6.5-1.5 0-1.5-.8V21A3 3 0 0 1 8 18z"
        fill={colors.accentFg}
      />
      <Path d="M12.5 12.5h7M12.5 16.5h4.5" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }} accessibilityLabel="Relay">
      <LogoMark size={size} />
      <Text variant="heading" style={{ fontSize: 20, letterSpacing: -0.6 }}>
        Relay
      </Text>
    </View>
  );
}
