import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../../src/lib/session";
import { font, useTheme } from "../../src/theme";
import { Icon } from "../../src/ui";

export default function TabsLayout() {
  const { ready, me } = useSession();
  const { colors } = useTheme();
  // Wait for the stored session before deciding; otherwise a reload lands on Welcome.
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (!me) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Icon name="home" size={22} color={color} />,
          tabBarBadge: me.counts.pendingActions > 0 ? me.counts.pendingActions : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, color: colors.accentFg, fontFamily: font.medium, fontSize: 12 },
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{ title: "Activity", tabBarIcon: ({ color }) => <Icon name="message-square" size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color }) => <Icon name="settings" size={22} color={color} /> }}
      />
    </Tabs>
  );
}
