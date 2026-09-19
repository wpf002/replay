import { useColorScheme } from "react-native";

// Same Signal tokens as apps/web/app/globals.css. Components use these names, never raw colors.
const light = {
  bg: "#faf9f7",
  surface: "#ffffff",
  surfaceMuted: "#f3f1ed",
  border: "#e6e3dd",
  borderStrong: "#d3cfc7",
  text: "#1b1a18",
  textMuted: "#625e57",
  accent: "#ff6a2a",
  accentPressed: "#f25a18",
  accentFg: "#1b1a18",
  success: "#1d7a45",
  danger: "#b42318",
  scrim: "rgba(27, 26, 24, 0.45)",
};

const dark: typeof light = {
  bg: "#0e0e0d",
  surface: "#171715",
  surfaceMuted: "#201f1d",
  border: "#2a2926",
  borderStrong: "#3a3935",
  text: "#eeece8",
  textMuted: "#a5a097",
  accent: "#ff6a2a",
  accentPressed: "#f25a18",
  accentFg: "#1b1a18",
  success: "#4ade80",
  danger: "#f87171",
  scrim: "rgba(0, 0, 0, 0.6)",
};

export type Colors = typeof light;
export type ColorName = keyof Colors;

/** 4px scale. Nothing off it. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64, 9: 96 } as const;

export const radius = { sm: 8, md: 12, pill: 999 } as const;

export const size = { sm: 12, base: 16, lg: 20, xl: 32 } as const;

export const font = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  bold: "Geist_700Bold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
} as const;

export function useTheme() {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? dark : light;
  return { colors, dark: scheme === "dark" };
}
