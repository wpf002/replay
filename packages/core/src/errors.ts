export { NotConfiguredError } from "@relay/types";

/** A user-facing failure whose message is safe to show as-is. */
export class UserError extends Error {
  readonly status: number;
  /** Machine-readable reason a client can branch on, like "no_credit". */
  readonly reason: string | undefined;
  constructor(message: string, status = 400, reason?: string) {
    super(message);
    this.name = "UserError";
    this.status = status;
    this.reason = reason;
  }
}
