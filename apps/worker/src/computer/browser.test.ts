import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkUrl, isBlockedHost, RelayBrowser, toPlaywrightKey } from "./browser.js";

describe("isBlockedHost", () => {
  it("blocks the server's own network", () => {
    for (const host of ["localhost", "api.localhost", "printer.local", "127.0.0.1", "10.0.0.8", "172.20.1.1", "192.168.1.55", "169.254.169.254", "[::1]", "fd00::1", "100.64.0.1"]) {
      expect(isBlockedHost(host), host).toBe(true);
    }
  });

  it("allows public sites", () => {
    for (const host of ["instacart.com", "www.united.com", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) {
      expect(isBlockedHost(host), host).toBe(false);
    }
  });
});

describe("checkUrl", () => {
  it("accepts http(s) and bare domains", () => {
    expect(checkUrl("opentable.com").toString()).toBe("https://opentable.com/");
    expect(checkUrl("http://example.com/a").toString()).toBe("http://example.com/a");
  });

  it("refuses other schemes and private hosts", () => {
    expect(() => checkUrl("javascript:alert(1)")).toThrow(/Only http and https/);
    expect(() => checkUrl("file:///etc/passwd")).toThrow(/Only http and https/);
    expect(() => checkUrl("http://169.254.169.254/latest/meta-data")).toThrow(/private network/);
  });
});

it("maps key names to Playwright's", () => {
  expect(toPlaywrightKey("Return")).toBe("Enter");
  expect(toPlaywrightKey("ctrl+a")).toBe("Control+a");
  expect(toPlaywrightKey("cmd+shift+t")).toBe("Meta+Shift+t");
  expect(toPlaywrightKey("page_down")).toBe("PageDown");
  expect(toPlaywrightKey("f5")).toBe("F5");
});

// Drives the installed Chrome against a page set inline. Skips where Chrome isn't installed.
const hasChrome = existsSync("/Applications/Google Chrome.app") || existsSync("/usr/bin/google-chrome") || Boolean(process.env.BROWSER_EXECUTABLE_PATH);

describe.skipIf(!hasChrome)("RelayBrowser", () => {
  let browser: RelayBrowser;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "relay-browser-"));
    process.env.BROWSER_PROFILE_DIR = dir;
    browser = await RelayBrowser.open("testuser", "America/Chicago");
    await browser.page().setContent(`
      <main>
        <h1>Order groceries</h1>
        <label for="q">Search items</label><input id="q" placeholder="Search">
        <label><input type="checkbox" id="organic"> Organic only</label>
        <select id="slot"><option>Today 5-6 PM</option><option>Tomorrow 9-10 AM</option></select>
        <input type="password" id="pw" value="hunter2">
        <button onclick="document.getElementById('out').textContent = 'Added ' + document.getElementById('q').value">Add to cart</button>
        <p id="out"></p>
      </main>`);
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await rm(dir, { recursive: true, force: true });
  });

  const text = (content: unknown) => JSON.stringify(content);

  it("reads the page with references and never shows password values", async () => {
    const outline = text(await browser.run("read_page", { filter: "all" }));
    expect(outline).toMatch(/heading \\"Order groceries\\"/);
    expect(outline).toMatch(/textbox \\"Search items\\" \[ref_\d+\]/);
    expect(outline).toMatch(/checkbox \\"Organic only\\" unchecked/);
    expect(outline).toMatch(/combobox .*selected=\\"Today 5-6 PM\\"/);
    expect(outline).not.toContain("hunter2");
  });

  it("fills, selects, checks, and clicks by reference", async () => {
    const ref = async (query: string) => /\[(ref_\d+)\]/.exec(text(await browser.run("find", { query })))![1]!;
    await browser.run("form_input", { target: { type: "ref", ref: await ref("Search items") }, value: "oat milk" });
    await browser.run("form_input", { target: { type: "ref", ref: await ref("Organic") }, value: true });
    await browser.run("form_input", { target: { type: "ref", ref: await ref("combobox") }, value: "Tomorrow 9-10 AM" });
    await browser.run("left_click", { target: { type: "ref", ref: await ref("Add to cart") } });

    expect(text(await browser.run("get_page_text", {}))).toContain("Added oat milk");
    const outline = text(await browser.run("read_page", { filter: "all" }));
    expect(outline).toMatch(/checkbox \\"Organic only\\" checked/);
    expect(outline).toMatch(/selected=\\"Tomorrow 9-10 AM\\"/);
  });

  it("types into the focused field and takes screenshots", async () => {
    await browser.page().locator("#q").fill("");
    await browser.run("left_click", { target: { type: "coordinate", ...(await center("#q")) } });
    await browser.run("type", { text: "eggs" });
    expect(await browser.page().locator("#q").inputValue()).toBe("eggs");
    const shot = (await browser.run("screenshot", {}))[0] as { type: string; source: { media_type: string } };
    expect(shot).toMatchObject({ type: "image", source: { media_type: "image/jpeg" } });
  });

  it("refuses to navigate to the server's network", async () => {
    await expect(browser.run("navigate", { url: "http://localhost:4000/health" })).rejects.toThrow(/private network/);
  });

  async function center(selector: string) {
    const box = (await browser.page().locator(selector).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
});
