import { perplexity } from "@relay/providers";
import { z } from "zod";
import { WEB_SEARCH_SYSTEM } from "../prompts.js";
import { formatDateTime } from "@relay/core";
import { defineTool } from "./types.js";

export const webSearch = defineTool({
  name: "web_search",
  description:
    "Search the live web for current or local information: business hours, prices, news, weather, events, schedules, or any fact that may have changed. Returns a short answer with source URLs.",
  input: z.object({
    query: z
      .string()
      .min(2)
      .max(400)
      .describe("A specific question. Include the place and date when they matter."),
  }),
  kind: "read",
  untrusted: true,
  describe: ({ query }) => `Search the web for "${query}"`,
  async run({ query }, ctx) {
    const key = ctx.keyFor("perplexity");
    if (!key) {
      return { content: "Web search isn't available for this person right now. Answer from what you know and say you couldn't check the web." };
    }
    const res = await perplexity.complete({
      ...key,
      system: { stable: WEB_SEARCH_SYSTEM },
      messages: [
        {
          role: "user",
          content: `${query}\n\n(Asked ${formatDateTime(ctx.now, ctx.timezone)}.)`,
        },
      ],
      maxTokens: 1200,
    });
    await ctx.onUsage("perplexity", res.usage, res.model);
    const sources = (res.citations ?? []).slice(0, 5);
    const list = sources.map((s) => `- ${s.title ? `${s.title}: ` : ""}${s.url}`).join("\n");
    return {
      content: sources.length ? `${res.text}\n\nSources:\n${list}` : res.text,
      citations: sources,
    };
  },
});
