import type Anthropic from "@anthropic-ai/sdk";
import { browserProfileDir, env } from "@relay/core";
import { COMPUTER_VIEWPORT, type ComputerInput } from "@relay/types";
import { mkdir } from "node:fs/promises";
import { isIP } from "node:net";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { SNAPSHOT_SCRIPT, type SnapshotOptions } from "./page-script.js";

type ResultContent = Exclude<Anthropic.ToolResultBlockParam["content"], string | undefined>;
type BrowserState = Anthropic.BrowserStateBlockParam;

/** Thrown for a browser action that can't run; its message goes back to the model. */
export class BrowserActionError extends Error {}

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/**
 * The browser runs on Relay's server, so pages and the model must not reach the server's own
 * network: localhost, private ranges, link-local metadata endpoints. (Names that resolve to
 * private addresses need a network-level block too; see README.)
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const family = isIP(host);
  if (family === 4) return PRIVATE_V4.some((r) => r.test(host));
  if (family === 6) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.startsWith("::ffff:");
  return false;
}

export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new BrowserActionError(`"${raw}" isn't a URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BrowserActionError("Navigation refused. Only http and https URLs are allowed.");
  }
  if (isBlockedHost(url.hostname)) throw new BrowserActionError("Navigation refused. That address is on a private network.");
  return url;
}

const KEY_NAMES: Record<string, string> = {
  return: "Enter", enter: "Enter", tab: "Tab", backspace: "Backspace", delete: "Delete", del: "Delete",
  escape: "Escape", esc: "Escape", space: "Space", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft",
  right: "ArrowRight", arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
  page_up: "PageUp", pageup: "PageUp", page_down: "PageDown", pagedown: "PageDown", home: "Home", end: "End",
  ctrl: "Control", control: "Control", alt: "Alt", option: "Alt", shift: "Shift", cmd: "Meta", command: "Meta",
  super: "Meta", meta: "Meta", win: "Meta",
};

/** "ctrl+a" -> "Control+a", "Return" -> "Enter". */
export function toPlaywrightKey(chord: string): string {
  return chord
    .split("+")
    .map((part) => {
      const k = part.trim();
      const mapped = KEY_NAMES[k.toLowerCase()];
      if (mapped) return mapped;
      if (/^f\d{1,2}$/i.test(k)) return k.toUpperCase();
      return k.length === 1 ? k : k.charAt(0).toUpperCase() + k.slice(1);
    })
    .join("+");
}

const MODIFIERS: Record<string, "Alt" | "Control" | "Meta" | "Shift"> = {
  shift: "Shift", ctrl: "Control", control: "Control", alt: "Alt", super: "Meta", meta: "Meta", cmd: "Meta",
};

type Target = { type: "coordinate"; x: number; y: number } | { type: "ref"; ref: string };
type Input = Record<string, unknown>;

/**
 * Relay's web browser for one person: Chrome with their own profile (their sign-ins), driven
 * through Anthropic's browser toolset. One instance per task; the profile can't be opened twice.
 */
export class RelayBrowser {
  private tabs = new Map<string, Page>();
  private active = "";
  private seq = 0;
  private opened: string[] = [];

  private constructor(private readonly context: BrowserContext) {}

  static async open(userId: string, timezone: string): Promise<RelayBrowser> {
    const dir = browserProfileDir(userId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const e = env();
    const context = await chromium.launchPersistentContext(dir, {
      headless: true,
      ...(e.BROWSER_EXECUTABLE_PATH ? { executablePath: e.BROWSER_EXECUTABLE_PATH } : { channel: e.BROWSER_CHANNEL ?? "chrome" }),
      viewport: { ...COMPUTER_VIEWPORT },
      deviceScaleFactor: 1,
      locale: "en-US",
      timezoneId: timezone,
      acceptDownloads: false,
    });
    // Subresources too: a page can't pull from the server's private network either.
    await context.route("**/*", (route) => {
      try {
        if (isBlockedHost(new URL(route.request().url()).hostname)) return route.abort("blockedbyclient");
      } catch {
        // data:, blob:, and similar have no host.
      }
      return route.continue();
    });
    const browser = new RelayBrowser(context);
    for (const page of context.pages()) browser.track(page);
    if (!browser.tabs.size) browser.track(await context.newPage());
    context.on("page", (page) => {
      const id = browser.track(page);
      browser.opened.push(id);
      browser.active = id;
    });
    return browser;
  }

  private track(page: Page): string {
    this.seq += 1;
    const id = `tab-${this.seq}`;
    this.tabs.set(id, page);
    if (!this.active) this.active = id;
    page.on("close", () => {
      this.tabs.delete(id);
      if (this.active === id) this.active = [...this.tabs.keys()].at(-1) ?? "";
    });
    return id;
  }

  page(tabId?: unknown): Page {
    const id = typeof tabId === "string" && tabId ? tabId : this.active;
    const page = this.tabs.get(id);
    if (!page) throw new BrowserActionError(`There is no tab ${id}.`);
    return page;
  }

  url(): string {
    return this.tabs.get(this.active)?.url() ?? "";
  }

  async title(): Promise<string> {
    return (await this.tabs.get(this.active)?.title().catch(() => "")) ?? "";
  }

  async screenshot(quality = 70): Promise<Buffer> {
    return this.page().screenshot({ type: "jpeg", quality, animations: "disabled", caret: "initial", timeout: 15_000 });
  }

  async setViewport(size: { width: number; height: number }): Promise<void> {
    await Promise.all([...this.tabs.values()].map((p) => p.setViewportSize(size).catch(() => undefined)));
  }

  async close(): Promise<void> {
    await this.context.close().catch(() => undefined);
  }

  private async state(): Promise<BrowserState> {
    const tabs = await Promise.all(
      [...this.tabs.entries()].map(async ([tab_id, page]) => ({
        tab_id,
        title: ((await page.title().catch(() => "")) || "").slice(0, 300),
        url: page.url().slice(0, 2000),
        active: tab_id === this.active,
      })),
    );
    const changes = this.opened.map((tab_id) => ({ type: "tab_opened" as const, tab_id }));
    this.opened = [];
    return { type: "browser_state", tabs, ...(changes.length ? { state_changes: changes } : {}) };
  }

  private async settle(page: Page): Promise<void> {
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => undefined);
  }

  private async point(page: Page, target: Target): Promise<{ x: number; y: number }> {
    if (target.type === "coordinate") return { x: target.x, y: target.y };
    const locator = page.locator(`[data-relay-ref="${target.ref.replace(/[^\w-]/g, "")}"]`).first();
    if (!(await locator.count())) {
      throw new BrowserActionError(`${target.ref} isn't on the page anymore. Read the page again for fresh references.`);
    }
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined);
    const box = await locator.boundingBox();
    if (!box) throw new BrowserActionError(`${target.ref} isn't visible.`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  private async withModifiers<T>(page: Page, raw: unknown, fn: () => Promise<T>): Promise<T> {
    const keys = typeof raw === "string" ? raw.split("+").map((m) => MODIFIERS[m.trim().toLowerCase()]).filter(Boolean) : [];
    for (const k of keys) await page.keyboard.down(k!);
    try {
      return await fn();
    } finally {
      for (const k of keys.reverse()) await page.keyboard.up(k!);
    }
  }

  private snapshot(page: Page, opts: SnapshotOptions): Promise<string> {
    return page.evaluate(`(${SNAPSHOT_SCRIPT})(${JSON.stringify(opts)})`) as Promise<string>;
  }

  /** Runs one browser toolset member and returns the tool_result content. */
  async run(name: string, input: Input): Promise<ResultContent> {
    const text = (t: string): ResultContent => [{ type: "text", text: t }];
    const before = this.url();

    switch (name) {
      case "navigate": {
        const page = this.page(input.tab_id);
        const url = String(input.url ?? "");
        if (url === "back") await page.goBack({ timeout: 20_000 }).catch(() => undefined);
        else if (url === "forward") await page.goForward({ timeout: 20_000 }).catch(() => undefined);
        else if (url === "reload") await page.reload({ timeout: 30_000 });
        else await page.goto(checkUrl(url).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
        await this.settle(page);
        return [{ type: "text", text: `Now on ${page.url()}` }, await this.state()];
      }
      case "screenshot":
        return [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await this.screenshot(80)).toString("base64") } }];

      case "left_click":
      case "right_click":
      case "middle_click":
      case "double_click":
      case "triple_click": {
        const page = this.page(input.tab_id);
        const { x, y } = await this.point(page, input.target as Target);
        const button = name === "right_click" ? "right" : name === "middle_click" ? "middle" : "left";
        const clickCount = name === "double_click" ? 2 : name === "triple_click" ? 3 : 1;
        await this.withModifiers(page, input.modifiers, () => page.mouse.click(x, y, { button, clickCount }));
        await this.settle(page);
        break;
      }
      case "hover":
      case "mouse_move": {
        const page = this.page(input.tab_id);
        const { x, y } = await this.point(page, input.target as Target);
        await page.mouse.move(x, y);
        break;
      }
      case "left_click_drag": {
        const page = this.page(input.tab_id);
        const from = await this.point(page, input.from as Target);
        const to = await this.point(page, input.target as Target);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 12 });
        await page.mouse.up();
        break;
      }
      case "scroll": {
        const page = this.page(input.tab_id);
        const target = (input.target as Target | undefined) ?? { type: "coordinate", x: 640, y: 400 };
        const { x, y } = await this.point(page, target);
        const amount = Math.min(10, Math.max(1, Number(input.scroll_amount ?? 3))) * 120;
        const dir = String(input.scroll_direction);
        await page.mouse.move(x, y);
        await page.mouse.wheel(dir === "left" ? -amount : dir === "right" ? amount : 0, dir === "up" ? -amount : dir === "down" ? amount : 0);
        await page.waitForTimeout(300);
        break;
      }
      case "scroll_to": {
        const page = this.page(input.tab_id);
        await this.point(page, input.target as Target);
        break;
      }
      case "type": {
        const page = this.page(input.tab_id);
        await page.keyboard.type(String(input.text ?? ""), { delay: 8 });
        break;
      }
      case "key": {
        const page = this.page(input.tab_id);
        const repeat = Math.min(100, Math.max(1, Number(input.repeat ?? 1)));
        const chords = String(input.text ?? "").split(/\s+/).filter(Boolean);
        for (let i = 0; i < repeat; i++) for (const chord of chords) await page.keyboard.press(toPlaywrightKey(chord));
        await this.settle(page);
        break;
      }
      case "wait": {
        await this.page(input.tab_id).waitForTimeout(Math.min(30, Math.max(0, Number(input.duration ?? 1))) * 1000);
        break;
      }
      case "read_page": {
        const opts: SnapshotOptions = { mode: "outline" };
        if (typeof input.filter === "string") opts.filter = input.filter;
        if (typeof input.depth === "number") opts.depth = input.depth;
        if (typeof input.ref === "string") opts.ref = input.ref;
        return text(await this.snapshot(this.page(input.tab_id), opts));
      }
      case "find":
        return text(await this.snapshot(this.page(input.tab_id), { mode: "find", filter: "all", query: String(input.query ?? "") }));
      case "get_page_text":
        return text(await this.snapshot(this.page(input.tab_id), { mode: "text" }));

      case "form_input": {
        const page = this.page(input.tab_id);
        const target = input.target as Target;
        if (target?.type !== "ref") throw new BrowserActionError("form_input needs an element reference.");
        const locator = page.locator(`[data-relay-ref="${target.ref.replace(/[^\w-]/g, "")}"]`).first();
        if (!(await locator.count())) throw new BrowserActionError(`${target.ref} isn't on the page anymore.`);
        // Typed loosely: the worker compiles without DOM types, and this runs in the page.
        const kind = await locator.evaluate((node: unknown) => {
          const el = node as { tagName: string; getAttribute(name: string): string | null };
          if (el.tagName === "SELECT") return "select";
          return ["checkbox", "radio"].includes((el.getAttribute("type") ?? "").toLowerCase()) ? "check" : "fill";
        });
        if (kind === "select") await locator.selectOption({ label: String(input.value) }).catch(() => locator.selectOption(String(input.value)));
        else if (kind === "check") await locator.setChecked(Boolean(input.value), { timeout: 5000 });
        else await locator.fill(String(input.value ?? ""), { timeout: 5000 });
        break;
      }

      case "new_tab": {
        const page = await this.context.newPage();
        const id = [...this.tabs.entries()].find(([, p]) => p === page)?.[0];
        if (id) this.active = id;
        return [await this.state()];
      }
      case "list_tabs":
        return [await this.state()];
      case "switch_tab": {
        const id = String(input.tab_id ?? "");
        const page = this.page(id);
        this.active = id;
        await page.bringToFront();
        return [await this.state()];
      }
      case "close_tab": {
        const id = String(input.tab_id ?? "");
        if (this.tabs.size <= 1) throw new BrowserActionError("That's the only tab.");
        await this.page(id).close();
        return [await this.state()];
      }
      default:
        throw new BrowserActionError(`${name} isn't available in Relay's browser.`);
    }

    const after = this.url();
    const note = name === "type" ? "Typed." : name === "key" ? "Pressed." : "Done.";
    return after !== before || this.opened.length ? [{ type: "text", text: note }, await this.state()] : text(note);
  }

  /** Something the person did in the live view while they had control. */
  async apply(input: ComputerInput): Promise<void> {
    const page = this.page();
    switch (input.type) {
      case "click":
        await page.mouse.click(input.x, input.y);
        break;
      case "type":
        await page.keyboard.type(input.text, { delay: 5 });
        break;
      case "key":
        await page.keyboard.press(input.key);
        break;
      case "scroll":
        await page.mouse.wheel(0, input.direction === "down" ? 500 : -500);
        break;
      case "navigate":
        await page.goto(checkUrl(input.url).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
        break;
      case "back":
        await page.goBack({ timeout: 20_000 }).catch(() => undefined);
        break;
    }
    await this.settle(page);
  }
}
