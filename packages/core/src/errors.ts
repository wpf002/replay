export { NotConfiguredError } from "@relay/types";

/** A user-facing failure whose message is safe to show as-is. */
export class UserError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserError";
    this.status = status;
  }
}
