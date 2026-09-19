import { chmodSync, copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

/** A .env file edited in place: comments, order, and untouched lines are kept as they were. */
export interface EnvFile {
  path: string;
  lines: string[];
}

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

function unquote(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    const inner = v.slice(1, -1);
    return v.startsWith('"') ? inner.replace(/\\n/g, "\n").replace(/\\"/g, '"') : inner;
  }
  // Unquoted values end at an inline comment.
  const hash = v.search(/\s#/);
  return hash === -1 ? v : v.slice(0, hash).trim();
}

function quote(value: string): string {
  return /^[A-Za-z0-9_\-.:/@+=,]*$/.test(value) ? value : `"${value.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function parseEnv(text: string): EnvFile {
  return { path: "", lines: text.split(/\r?\n/) };
}

/** Reads `path`, creating it from `example` first if it doesn't exist. */
export function readEnvFile(path: string, example?: string): EnvFile {
  if (!existsSync(path) && example && existsSync(example)) copyFileSync(example, path);
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  return { ...parseEnv(text), path };
}

export function getEnv(file: EnvFile, key: string): string | undefined {
  for (const line of file.lines) {
    const m = LINE.exec(line);
    if (m && m[1] === key) {
      const value = unquote(m[2] ?? "");
      return value === "" ? undefined : value;
    }
  }
  return undefined;
}

/** Replaces the first `KEY=` line, or appends one. */
export function setEnv(file: EnvFile, key: string, value: string): void {
  const next = `${key}=${quote(value)}`;
  const index = file.lines.findIndex((line) => LINE.exec(line)?.[1] === key);
  if (index >= 0) {
    file.lines[index] = next;
    return;
  }
  while (file.lines.length && file.lines[file.lines.length - 1] === "") file.lines.pop();
  file.lines.push(next, "");
}

export function envText(file: EnvFile): string {
  return file.lines.join("\n");
}

/** Atomic write, readable only by the owner. */
export function writeEnvFile(file: EnvFile): void {
  const tmp = `${file.path}.tmp-${process.pid}`;
  writeFileSync(tmp, envText(file), { mode: 0o600 });
  renameSync(tmp, file.path);
  chmodSync(file.path, 0o600);
}
