import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { font, size, useTheme, type ColorName } from "../theme";

export type Variant = "display" | "title" | "heading" | "body" | "bodyMedium" | "caption" | "eyebrow" | "mono";

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: font.bold, fontSize: size.xl, lineHeight: 36, letterSpacing: -1 },
  title: { fontFamily: font.bold, fontSize: size.xl, lineHeight: 38, letterSpacing: -0.8 },
  heading: { fontFamily: font.medium, fontSize: size.lg, lineHeight: 26, letterSpacing: -0.3 },
  body: { fontFamily: font.regular, fontSize: size.base, lineHeight: 24 },
  bodyMedium: { fontFamily: font.medium, fontSize: size.base, lineHeight: 24 },
  caption: { fontFamily: font.regular, fontSize: size.sm, lineHeight: 16 },
  eyebrow: {
    fontFamily: font.monoMedium,
    fontSize: size.sm,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  mono: { fontFamily: font.mono, fontSize: size.base, lineHeight: 24 },
};

export interface TextProps extends RNTextProps {
  variant?: Variant;
  color?: ColorName;
  center?: boolean;
}

export function Text({ variant = "body", color, center, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const tone: ColorName = color ?? (variant === "caption" || variant === "eyebrow" ? "textMuted" : "text");
  return (
    <RNText
      {...rest}
      style={[VARIANTS[variant], { color: colors[tone] }, center && { textAlign: "center" }, style]}
    />
  );
}
