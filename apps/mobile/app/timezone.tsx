import type { MeDTO } from "@relay/types";
import { getCalendars } from "expo-localization";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert } from "react-native";
import { api, ApiError } from "../src/lib/api";
import { useMe, useSession } from "../src/lib/session";
import { Field, Icon, ListGroup, ListRow, Screen, Section } from "../src/ui";
import { PageHeader } from "../src/ui/nav";

const COMMON = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
  "America/Toronto",
  "America/Vancouver",
  "America/Halifax",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

function label(zone: string): string {
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${zone.replace(/_/g, " ").replace("/", " / ")}${offset ? `  ${offset}` : ""}`;
}

export default function TimezoneScreen() {
  const me = useMe();
  const { setMe } = useSession();
  const [query, setQuery] = useState("");
  const device = getCalendars()[0]?.timeZone ?? null;

  const zones = useMemo(() => {
    const all = Array.from(new Set([...(device ? [device] : []), me.timezone, ...COMMON]));
    const q = query.trim().toLowerCase();
    return q ? all.filter((z) => z.toLowerCase().replace(/_/g, " ").includes(q)) : all;
  }, [device, me.timezone, query]);

  async function pick(zone: string) {
    try {
      setMe(await api<MeDTO>("/v1/me", { method: "PATCH", body: { timezone: zone } }));
      router.back();
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof ApiError ? err.message : "Try again.");
    }
  }

  return (
    <Screen keyboard>
      <PageHeader back title="Time zone" body="Reminders, calendar events, and 'tomorrow' all use it." />
      <Field value={query} onChangeText={setQuery} placeholder="Search" autoCorrect={false} leading={<Icon name="search" size={18} tone="textMuted" />} />
      <Section>
        <ListGroup>
          {zones.map((z) => (
            <ListRow
              key={z}
              icon={z === device ? "smartphone" : "globe"}
              title={label(z)}
              subtitle={z === device ? "This phone's time zone" : undefined}
              onPress={() => void pick(z)}
              accessory={z === me.timezone ? <Icon name="check" size={18} /> : undefined}
            />
          ))}
        </ListGroup>
      </Section>
    </Screen>
  );
}
