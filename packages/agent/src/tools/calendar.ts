import { formatRange, GOOGLE_SCOPES, googleAuthFor } from "@relay/core";
import { google, type calendar_v3 } from "googleapis";
import { z } from "zod";
import { defineTool, type ToolContext } from "./types.js";

async function calendarFor(ctx: ToolContext): Promise<calendar_v3.Calendar> {
  return google.calendar({
    version: "v3",
    auth: await googleAuthFor(ctx.userId, [GOOGLE_SCOPES.calendar]),
  });
}

const isoWithOffset = z.iso.datetime({ offset: true });

function describeEvent(e: calendar_v3.Schema$Event, timeZone: string): string {
  let when: string;
  if (e.start?.dateTime) {
    when = formatRange(new Date(e.start.dateTime), e.end?.dateTime ? new Date(e.end.dateTime) : null, timeZone);
  } else {
    when = `${e.start?.date ?? "?"} (all day)`;
  }
  const others = (e.attendees ?? []).filter((a) => !a.self).length;
  return [
    `- ${when} | ${e.summary ?? "(no title)"}`,
    e.location ? ` | at ${e.location}` : "",
    others ? ` | with ${others} other${others === 1 ? "" : "s"}` : "",
    e.status === "tentative" ? " | tentative" : "",
  ].join("");
}

export const calendarList = defineTool({
  name: "calendar_list",
  description:
    "List events on the person's primary Google Calendar between two times. Use their time zone offset from your context.",
  input: z.object({
    start: isoWithOffset.describe("Range start, ISO 8601 with UTC offset"),
    end: isoWithOffset.describe("Range end, ISO 8601 with UTC offset"),
    query: z.string().max(100).optional().describe("Optional text to match in event details"),
  }),
  kind: "read",
  untrusted: true,
  needsGoogle: true,
  describe: ({ start, end }) => `Check your calendar from ${start} to ${end}`,
  async run({ start, end, query }, ctx) {
    const calendar = await calendarFor(ctx);
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date(start).toISOString(),
      timeMax: new Date(end).toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 25,
      ...(query ? { q: query } : {}),
    });
    const events = (res.data.items ?? []).filter((e) => e.status !== "cancelled");
    if (!events.length) return { content: "No events in that range." };
    return { content: events.map((e) => describeEvent(e, ctx.timezone)).join("\n") };
  },
});

export const calendarCreate = defineTool({
  name: "calendar_create",
  description:
    "Add an event to the person's primary Google Calendar. Adding it only for them happens right away. Inviting other people sends them email invites, so the person approves it first.",
  input: z
    .object({
      title: z.string().trim().min(1).max(200),
      start: isoWithOffset.describe("ISO 8601 with UTC offset"),
      end: isoWithOffset.optional().describe("Defaults to one hour after start"),
      location: z.string().trim().max(300).optional(),
      description: z.string().trim().max(2000).optional(),
      attendees: z.array(z.email()).max(20).optional().describe("Emails of other people to invite"),
    })
    .refine((e) => !e.end || new Date(e.end) > new Date(e.start), {
      message: "end must be after start",
      path: ["end"],
    }),
  kind: "write",
  needsGoogle: true,
  needsApproval: (e) => (e.attendees?.length ?? 0) > 0,
  describe: (e, ctx) => {
    const start = new Date(e.start);
    const end = e.end ? new Date(e.end) : new Date(start.getTime() + 3_600_000);
    const invites = e.attendees?.length ? `, and email invites to ${e.attendees.join(", ")}` : "";
    return `Add "${e.title}" to your calendar, ${formatRange(start, end, ctx.timezone)}${e.location ? ` at ${e.location}` : ""}${invites}`;
  },
  async run(e, ctx) {
    const calendar = await calendarFor(ctx);
    const start = new Date(e.start);
    const end = e.end ? new Date(e.end) : new Date(start.getTime() + 3_600_000);
    const invites = e.attendees ?? [];
    const res = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: invites.length ? "all" : "none",
      requestBody: {
        summary: e.title,
        ...(e.location ? { location: e.location } : {}),
        ...(e.description ? { description: e.description } : {}),
        start: { dateTime: start.toISOString(), timeZone: ctx.timezone },
        end: { dateTime: end.toISOString(), timeZone: ctx.timezone },
        ...(invites.length ? { attendees: invites.map((email) => ({ email })) } : {}),
      },
    });
    const when = formatRange(start, end, ctx.timezone);
    return {
      content: `Created "${e.title}", ${when}.`,
      receipt: `Added "${e.title}" to your calendar, ${when}${invites.length ? `, and sent invites` : ""}.`,
      data: { eventId: res.data.id ?? null, link: res.data.htmlLink ?? null },
    };
  },
});
