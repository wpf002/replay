// Server-only. Values the legal pages and 10DLC campaign registration depend on. Unset values render as a
// bracketed TODO so a missing one is visible on the page instead of silently wrong.
export const site = {
  name: "Relay",
  legalEntity: process.env.LEGAL_ENTITY || "[set LEGAL_ENTITY]",
  supportEmail: process.env.SUPPORT_EMAIL || "[set SUPPORT_EMAIL]",
  url: process.env.PUBLIC_WEB_URL || "http://localhost:3000",
  legalUpdated: "September 19, 2026",
};

export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  return new URL(path, base).toString();
}
