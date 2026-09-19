import type { ModelId } from "@relay/types";

export const MODEL_INFO: Record<ModelId, { name: string; by: string; prefix: string; blurb: string }> = {
  claude: {
    name: "Claude",
    by: "Anthropic",
    prefix: "@claude",
    blurb: "Writing, reasoning, and anything that takes actions.",
  },
  gpt: {
    name: "GPT",
    by: "OpenAI",
    prefix: "@gpt",
    blurb: "A second opinion, with the same email, calendar, and reminder tools.",
  },
  perplexity: {
    name: "Perplexity",
    by: "Sonar",
    prefix: "@web",
    blurb: "Live web answers with sources. Can't take actions.",
  },
};
