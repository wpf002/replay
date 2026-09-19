import { Redirect } from "expo-router";

// Target of relay://connections?google=... when Google's redirect opens the app outside an
// auth session. The auth session normally consumes it; this just lands on Settings.
export default function Connections() {
  return <Redirect href="/(tabs)/settings" />;
}
