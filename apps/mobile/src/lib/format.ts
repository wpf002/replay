/** Digits typed into a US number field -> "(512) 555-0123" as they type. */
export function formatUsInput(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** "+15125550123" -> "(512) 555-0123"; other numbers are returned as-is. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 hr ago", "Tue", "Sep 12". */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const diff = now - t;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`;
  if (diff < 6 * DAY) return new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "in 12 min", "in 2 hr". */
export function timeUntil(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "now";
  if (diff < HOUR) return `in ${Math.max(1, Math.round(diff / MINUTE))} min`;
  if (diff < DAY) return `in ${Math.round(diff / HOUR)} hr`;
  return `in ${Math.round(diff / DAY)} days`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "Sunday at 5:00 PM", or with the date when it's more than a week out. */
export function whenLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const far = Math.abs(d.getTime() - now) > 6 * DAY;
  const day = d.toLocaleDateString("en-US", far ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "long" });
  return `${day} at ${clockTime(iso)}`;
}

/** Day header for the activity feed: "Today", "Yesterday", "Monday, Sep 15". */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
