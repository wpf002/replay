import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_700Bold } from "@expo-google-fonts/geist/700Bold";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono/500Medium";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/lib/session";
import { useTheme } from "../src/theme";

export default function RootLayout() {
  const { colors, dark } = useTheme();
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style={dark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="pin" options={{ presentation: "modal" }} />
          <Stack.Screen name="ai/[provider]" options={{ presentation: "modal" }} />
          <Stack.Screen name="browser-signin" options={{ presentation: "modal" }} />
          <Stack.Screen name="memories" options={{ presentation: "card" }} />
          <Stack.Screen name="reminders" options={{ presentation: "card" }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
