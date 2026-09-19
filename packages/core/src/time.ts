/** "Friday, September 19, 2026 at 1:42 PM CDT" in the given zone. */
export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

/** "Sunday at 5:00 PM", or "Sunday, Oct 5 at 5:00 PM" when it's more than 6 days out. */
export function formatWhen(date: Date, timeZone: string, now = new Date()): string {
  const days = Math.abs(date.getTime() - now.getTime()) / 86_400_000;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    ...(days > 6 ? { month: "short", day: "numeric" } : {}),
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    date,
  );
  return `${day} at ${time}`;
}

/** UTC offset like "-05:00" for the zone at that instant. */
export function utcOffset(date: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = /GMT([+-]\d{2}:\d{2})/.exec(part ?? "");
  return match?.[1] ?? "+00:00";
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The instant local midnight began in `timeZone` for the day containing `now`. */
export function startOfDay(timeZone: string, now = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const [sign, hh, mm] = /([+-])(\d{2}):(\d{2})/.exec(utcOffset(now, timeZone))?.slice(1) ?? ["+", "00", "00"];
  const offsetMin = (sign === "-" ? -1 : 1) * (Number(hh) * 60 + Number(mm));
  const midnightUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return new Date(midnightUtc - offsetMin * 60_000);
}

/** "Tue, Sep 23, 3:00 PM – 4:00 PM" (end time omitted when it's on another day). */
export function formatRange(start: Date, end: Date | null, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const first = `${day.format(start)}, ${time.format(start)}`;
  if (!end) return first;
  return day.format(start) === day.format(end)
    ? `${first} – ${time.format(end)}`
    : `${first} – ${day.format(end)}, ${time.format(end)}`;
}

/** Wall-clock fields of an instant in a zone. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday as string,
  };
}

function offsetMinutes(date: Date, timeZone: string): number {
  const [sign, hh, mm] = /([+-])(\d{2}):(\d{2})/.exec(utcOffset(date, timeZone))?.slice(1) ?? ["+", "00", "00"];
  return (sign === "-" ? -1 : 1) * (Number(hh) * 60 + Number(mm));
}

/** Same local wall-clock time `days` later, correct across DST changes. */
export function addLocalDays(date: Date, days: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day + days, p.hour, p.minute, p.second);
  let result = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  // The offset at the guess can differ from the offset at the answer near a DST switch.
  result = wall - offsetMinutes(new Date(result), timeZone) * 60_000;
  return new Date(result);
}
