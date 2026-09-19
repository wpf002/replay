import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

const color = !process.env.NO_COLOR && process.stdout.isTTY;
const wrap = (code: string) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
export const bold = wrap("1");
export const dim = wrap("2");
export const green = wrap("32");
export const red = wrap("31");
export const yellow = wrap("33");

export const ok = (s: string) => console.log(`  ${green("✓")} ${s}`);
export const bad = (s: string) => console.log(`  ${red("✗")} ${s}`);
export const warn = (s: string) => console.log(`  ${yellow("!")} ${s}`);
export const note = (s: string) => console.log(`  ${dim(s)}`);

export async function ask(question: string, fallback?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const hint = fallback ? dim(` [${fallback}]`) : "";
    const answer = (await rl.question(`  ${question}${hint}: `)).trim();
    return answer || fallback || "";
  } finally {
    rl.close();
  }
}

/** Reads a secret without echoing it. Paste works; shows one dot per character. */
export async function secret(question: string): Promise<string> {
  if (!process.stdin.isTTY) return ask(question);
  process.stdout.write(`  ${question} ${dim("(hidden)")}: `);
  return new Promise((resolve) => {
    let value = "";
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value.trim());
          return;
        }
        if (ch === "") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "" || ch === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (ch >= " ") {
          value += ch;
          process.stdout.write("•");
        }
      }
    };
    stdin.on("data", onData);
  });
}

export async function confirm(question: string, fallback = false): Promise<boolean> {
  const answer = (await ask(`${question} ${dim(fallback ? "(Y/n)" : "(y/N)")}`)).toLowerCase();
  if (!answer) return fallback;
  return answer === "y" || answer === "yes";
}

export async function choose(question: string, options: { key: string; label: string }[]): Promise<string> {
  for (const o of options) console.log(`    ${bold(o.key)}) ${o.label}`);
  for (;;) {
    const answer = await ask(question);
    if (options.some((o) => o.key === answer)) return answer;
    warn(`Pick one of: ${options.map((o) => o.key).join(", ")}`);
  }
}

/** Opens a URL in the default browser, where you're already signed in to the provider. */
export function openUrl(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // Printing the URL is enough when there's no browser.
  }
  note(`Opened ${url}`);
}

export function heading(title: string): void {
  console.log(`\n${bold(title)}`);
}
