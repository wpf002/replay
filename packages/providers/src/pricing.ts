export interface Price {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

/** Used when a *_PRICE variable is unset, so a missing price over-counts instead of under-counting. */
export const CONSERVATIVE_PRICE: Price = { input: 15, output: 75 };

/** Parses "input/output" USD per million tokens, e.g. "5/25". */
export function parsePrice(value: string | undefined): Price {
  const match = /^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/.exec(value ?? "");
  if (!match) return CONSERVATIVE_PRICE;
  return { input: Number(match[1]), output: Number(match[2]) };
}

/** $X per million tokens is X micro-dollars per token. */
export function costMicros(price: Price, inputTokens: number, outputTokens: number): number {
  return Math.ceil(price.input * inputTokens + price.output * outputTokens);
}
