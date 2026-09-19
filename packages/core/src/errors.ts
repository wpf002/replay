/** A required env var is missing. HTTP layers map this to 501 with the TODO in the message. */
export class NotConfiguredError extends Error {
  readonly variable: string;
  constructor(variable: string) {
    super(`TODO: set ${variable} to enable this`);
    this.name = "NotConfiguredError";
    this.variable = variable;
  }
}

/** A user-facing failure whose message is safe to show as-is. */
export class UserError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserError";
    this.status = status;
  }
}
