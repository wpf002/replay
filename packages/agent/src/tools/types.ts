import type { Citation, Usage } from "@relay/providers";
import type { ModelId } from "@relay/types";
import type { z } from "zod";

export type ToolKind =
  /** Reads data. Never needs approval. */
  | "read"
  /** Changes the user's own data (memory, reminders, own calendar). Needs approval only when tainted. */
  | "write"
  /** Sends, spends, or contacts someone else. Always needs approval. */
  | "external";

export type Risk = "LOW" | "MEDIUM" | "HIGH";

export interface ToolContext {
  userId: string;
  userName: string | null;
  phone: string;
  timezone: string;
  channel: "sms" | "voice";
  conversationId: string;
  now: Date;
  hasGoogle: boolean;
  /** Called for every model request a tool makes, so spend caps see it. */
  onUsage: (provider: ModelId, usage: Usage, model: string) => Promise<void>;
}

export interface ToolOutput {
  /** What the model sees as the tool result. */
  content: string;
  /** One line texted to the user after an approved action runs, e.g. "Sent to sam@example.com." */
  receipt?: string;
  /** Stored on Action.result for approved actions. */
  data?: Record<string, unknown>;
  citations?: Citation[];
}

export interface ToolDef<I = unknown> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  kind: ToolKind;
  /** Output includes third-party content (email bodies, web pages, invites). */
  untrusted?: boolean;
  needsGoogle?: boolean;
  /** Tools that can't run during a call (too slow, or they need a screen). */
  smsOnly?: boolean;
  /** Risk for calls that need approval. Defaults to MEDIUM. HIGH also requires the PIN. */
  risk?: (input: I) => Risk;
  /** Forces approval for specific inputs, e.g. calendar invites that include other people. */
  needsApproval?: (input: I) => boolean;
  /**
   * Exact description shown to the user before they approve. Built from the validated input,
   * never from model prose, so what they approve is what runs.
   */
  describe: (input: I, ctx: ToolContext) => string;
  run: (input: I, ctx: ToolContext) => Promise<ToolOutput>;
}

// Tool lists are heterogeneous; `run` receives input already parsed by `input`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ToolDef<any>;

export function defineTool<I>(tool: ToolDef<I>): ToolDef<I> {
  return tool;
}
