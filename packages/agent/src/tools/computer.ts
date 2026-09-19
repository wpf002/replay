import { pushComputerSignal, startComputerTask, UserError } from "@relay/core";
import { z } from "zod";
import { defineTool } from "./types.js";

export const useComputer = defineTool({
  name: "use_computer",
  description:
    "Do something on a website with Relay's own web browser: book flights, hotels, or restaurant tables online, order groceries or takeout, buy something, fill out a form, change a booking, or look something up inside the person's account. It runs in the background: it texts them questions, asks their OK before anything that spends money, books, or sends, and texts the result. Sites that need a login use the person's own account; they sign in themselves in the Relay app when asked. Use place_call instead when the business only takes bookings by phone.",
  input: z.object({
    task: z
      .string()
      .min(10)
      .max(2000)
      .describe(
        "Everything the browser needs, in one paragraph: what to do, which site if known, dates and times, party size, items and quantities, budget, and preferences. Include details from the conversation and memory; it can't see them otherwise.",
      ),
    start_url: z.string().url().optional().describe("The site to start on, when you know it."),
  }),
  kind: "write",
  describe: ({ task }) => `Use Relay's browser to: ${task}`,
  async run({ task, start_url }, ctx) {
    if (!ctx.keyFor("claude")) {
      throw new UserError("Relay's browser runs on Claude. Connect Claude in the Relay app to use it.");
    }
    const started = await startComputerTask(ctx.userId, {
      goal: task,
      startUrl: start_url ?? null,
      conversationId: ctx.channel === "sms" ? ctx.conversationId : null,
    });
    return {
      content:
        "Started in Relay's browser. It texts the person any questions, asks their OK before anything final, and texts the result. Tell them in one short sentence that you're on it.",
      data: { taskId: started.id },
    };
  },
});

/**
 * Approval step of a browser task. Never offered to the model: the browser task creates these
 * Actions itself, and approving one lets the task continue.
 */
export const computerConfirm = defineTool({
  name: "computer_confirm",
  description: "Continue a browser task after the person approves.",
  input: z.object({ taskId: z.string() }),
  kind: "external",
  describe: () => "Continue the browser task",
  async run({ taskId }) {
    await pushComputerSignal(taskId, { type: "approved" });
    return { content: "Approved.", receipt: "Approved. Finishing up now." };
  },
});
