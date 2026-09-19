import { Redirect } from "expo-router";
import { requireSession } from "../src/lib/session";

// Target of relay://connections?google=... when Google's redirect opens the app outside an
// auth session. The auth session normally consumes it; this just lands on Settings.
function Connections() {
  return <Redirect href="/(tabs)/settings" />;
}

export default requireSession(Connections);
