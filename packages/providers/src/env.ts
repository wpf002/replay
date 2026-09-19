import { NotConfiguredError } from "@relay/types";

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new NotConfiguredError(name);
  return value;
}

export function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}
