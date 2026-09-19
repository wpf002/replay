import { GOOGLE_SCOPES, googleAuthFor } from "@relay/core";
import { google, type gmail_v1 } from "googleapis";
import { z } from "zod";
import { defineTool, type ToolContext } from "./types.js";

const BODY_LIMIT = 6000;

async function gmailFor(ctx: ToolContext, scopes: string[]): Promise<gmail_v1.Gmail> {
  return google.gmail({ version: "v1", auth: await googleAuthFor(ctx.userId, scopes) });
}

function header(msg: gmail_v1.Schema$Message, name: string): string {
  const h = msg.payload?.headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** Prefers text/plain; falls back to stripped text/html. */
export function extractBody(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  const decode = (data?: string | null) => (data ? Buffer.from(data, "base64url").toString("utf8") : "");
  const find = (p: gmail_v1.Schema$MessagePart, mime: string): gmail_v1.Schema$MessagePart | undefined => {
    if (p.mimeType === mime && p.body?.data) return p;
    for (const child of p.parts ?? []) {
      const hit = find(child, mime);
      if (hit) return hit;
    }
    return undefined;
  };
  const plain = find(part, "text/plain");
  if (plain) return decode(plain.body?.data).trim();
  const html = find(part, "text/html");
  return html ? htmlToText(decode(html.body?.data)) : "";
}

/** RFC 2822 message, base64url-encoded for the Gmail API. */
export function buildRawEmail(e: {
  to: string[];
  cc?: string[] | undefined;
  subject: string;
  body: string;
  inReplyTo?: string | undefined;
}): string {
  const subject = e.subject.replace(/[\r\n]+/g, " ");
  const encodedSubject = /^[\x20-\x7e]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const lines = [
    `To: ${e.to.join(", ")}`,
    ...(e.cc?.length ? [`Cc: ${e.cc.join(", ")}`] : []),
    `Subject: ${encodedSubject}`,
    ...(e.inReplyTo ? [`In-Reply-To: ${e.inReplyTo}`, `References: ${e.inReplyTo}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(e.body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export const gmailSearch = defineTool({
  name: "gmail_search",
  description:
    "Search the person's Gmail using Gmail search syntax (from:, to:, subject:, is:unread, newer_than:2d, older_than:, has:attachment, in:inbox). Returns sender, subject, date, a snippet, and a message ID for gmail_read. For 'anything new?' use is:unread newer_than:1d.",
  input: z.object({
    query: z.string().max(300).default("in:inbox"),
    max: z.number().int().min(1).max(15).default(8),
  }),
  kind: "read",
  untrusted: true,
  needsGoogle: true,
  describe: ({ query }) => `Search Gmail for "${query}"`,
  async run({ query, max }, ctx) {
    const gmail = await gmailFor(ctx, [GOOGLE_SCOPES.gmailRead]);
    const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: max });
    const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    if (!ids.length) return { content: "No matching emails." };

    const messages = await Promise.all(
      ids.map((id) =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        }),
      ),
    );
    const lines = messages.map(({ data }) => {
      const unread = data.labelIds?.includes("UNREAD") ? " (unread)" : "";
      return `- [${data.id}] ${header(data, "Date")} | From: ${header(data, "From")} | Subject: ${header(data, "Subject")}${unread}\n  ${decodeEntities(data.snippet ?? "")}`;
    });
    return { content: lines.join("\n") };
  },
});

export const gmailRead = defineTool({
  name: "gmail_read",
  description: "Read one email in full by the message ID from gmail_search.",
  input: z.object({ messageId: z.string().min(1) }),
  kind: "read",
  untrusted: true,
  needsGoogle: true,
  describe: ({ messageId }) => `Read email ${messageId}`,
  async run({ messageId }, ctx) {
    const gmail = await gmailFor(ctx, [GOOGLE_SCOPES.gmailRead]);
    const { data } = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
    let body = extractBody(data.payload);
    if (body.length > BODY_LIMIT) body = `${body.slice(0, BODY_LIMIT)}\n[truncated]`;
    return {
      content: [
        `From: ${header(data, "From")}`,
        `To: ${header(data, "To")}`,
        `Date: ${header(data, "Date")}`,
        `Subject: ${header(data, "Subject")}`,
        "",
        body || "(no text body)",
      ].join("\n"),
    };
  },
});

const email = z.email().max(254);

export const gmailSend = defineTool({
  name: "gmail_send",
  description:
    "Send an email from the person's Gmail. Nothing is sent until they approve the exact message, so pass the complete final subject and body. To reply in an existing thread, pass replyToMessageId from gmail_search.",
  input: z.object({
    to: z.array(email).min(1).max(10),
    cc: z.array(email).max(10).optional(),
    subject: z.string().trim().min(1).max(200),
    body: z
      .string()
      .trim()
      .min(1)
      .max(1200)
      .describe("Plain text. Sign it with the person's name when you know it."),
    replyToMessageId: z.string().optional(),
  }),
  kind: "external",
  needsGoogle: true,
  describe: ({ to, cc, subject, body }) =>
    `Send email to ${to.join(", ")}${cc?.length ? ` (cc ${cc.join(", ")})` : ""}\nSubject: ${subject}\n\n${body}`,
  async run({ to, cc, subject, body, replyToMessageId }, ctx) {
    const gmail = await gmailFor(ctx, [GOOGLE_SCOPES.gmailSend, GOOGLE_SCOPES.gmailRead]);
    let threadId: string | undefined;
    let inReplyTo: string | undefined;
    if (replyToMessageId) {
      const original = await gmail.users.messages.get({
        userId: "me",
        id: replyToMessageId,
        format: "metadata",
        metadataHeaders: ["Message-ID"],
      });
      threadId = original.data.threadId ?? undefined;
      inReplyTo = header(original.data, "Message-ID") || undefined;
    }
    const raw = buildRawEmail({ to, cc, subject, body, inReplyTo });
    const sent = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, ...(threadId ? { threadId } : {}) },
    });
    return {
      content: `Sent. Gmail message ID ${sent.data.id}.`,
      receipt: `Sent your email to ${to.join(", ")}.`,
      data: { messageId: sent.data.id ?? null, threadId: sent.data.threadId ?? null },
    };
  },
});
