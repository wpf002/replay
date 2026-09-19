import type { ModelId as DbModelId } from "@relay/db";
import type { ModelId } from "@relay/types";

const TO_DB: Record<ModelId, DbModelId> = { claude: "CLAUDE", gpt: "GPT", perplexity: "PERPLEXITY" };
const FROM_DB: Record<DbModelId, ModelId> = { CLAUDE: "claude", GPT: "gpt", PERPLEXITY: "perplexity" };

export const toDbModel = (m: ModelId): DbModelId => TO_DB[m];
export const fromDbModel = (m: DbModelId): ModelId => FROM_DB[m];

export const MODEL_LABELS: Record<ModelId, string> = {
  claude: "Claude",
  gpt: "GPT",
  perplexity: "Perplexity",
};
