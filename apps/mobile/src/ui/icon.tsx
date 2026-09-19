import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { useTheme, type ColorName } from "../theme";

export type IconName = ComponentProps<typeof Feather>["name"];

export function Icon({
  name,
  size = 20,
  color,
  tone = "text",
}: {
  name: IconName;
  size?: number;
  color?: ComponentProps<typeof Feather>["color"];
  tone?: ColorName;
}) {
  const { colors } = useTheme();
  return <Feather name={name} size={size} color={color ?? colors[tone]} />;
}
