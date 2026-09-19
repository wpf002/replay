import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../src/lib/session";
import { useTheme } from "../src/theme";

export default function Index() {
  const { ready, me } = useSession();
  const { colors } = useTheme();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  return <Redirect href={me ? "/(tabs)" : "/welcome"} />;
}
