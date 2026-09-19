import { describe, expect, it } from "vitest";
import { buildRawEmail, extractBody, htmlToText } from "./gmail.js";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("buildRawEmail", () => {
  it("builds a plain-text message with encoded non-ASCII subject", () => {
    const raw = buildRawEmail({
      to: ["sam@example.com"],
      cc: ["pat@example.com"],
      subject: "Café tomorrow",
      body: "Running late.\nSee you soon.",
    });
    const text = Buffer.from(raw, "base64url").toString("utf8");
    expect(text).toContain("To: sam@example.com\r\n");
    expect(text).toContain("Cc: pat@example.com\r\n");
    expect(text).toContain(`Subject: =?UTF-8?B?${Buffer.from("Café tomorrow").toString("base64")}?=`);
    const body = text.split("\r\n\r\n")[1]!;
    expect(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe("Running late.\nSee you soon.");
  });

  it("strips line breaks from the subject so headers can't be injected", () => {
    const raw = buildRawEmail({ to: ["a@example.com"], subject: "Hi\r\nBcc: evil@example.com", body: "x" });
    const text = Buffer.from(raw, "base64url").toString("utf8");
    expect(text).not.toMatch(/^Bcc:/m);
  });

  it("threads replies", () => {
    const raw = buildRawEmail({ to: ["a@example.com"], subject: "Re: plan", body: "ok", inReplyTo: "<abc@mail>" });
    const text = Buffer.from(raw, "base64url").toString("utf8");
    expect(text).toContain("In-Reply-To: <abc@mail>");
  });
});

describe("extractBody", () => {
  it("prefers text/plain inside multipart", () => {
    expect(
      extractBody({
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64("Plain version") } },
          { mimeType: "text/html", body: { data: b64("<p>HTML version</p>") } },
        ],
      }),
    ).toBe("Plain version");
  });

  it("falls back to HTML converted to text", () => {
    expect(extractBody({ mimeType: "text/html", body: { data: b64("<p>Hi &amp; bye</p><script>x()</script>") } })).toBe(
      "Hi & bye",
    );
  });
});

describe("htmlToText", () => {
  it("keeps line structure", () => {
    expect(htmlToText("<div>One</div><div>Two<br>Three</div>")).toBe("One\nTwo\nThree");
  });
});
