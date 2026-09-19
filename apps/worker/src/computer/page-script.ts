// Runs inside the page. Kept as source text because the worker compiles without DOM types.
// Builds an accessibility-style outline of the page and tags elements with data-relay-ref so
// the model can act on them by reference.

export interface SnapshotOptions {
  mode: "outline" | "find" | "text";
  /** outline: "interactive" | "all" | "visible" (default: what's in the viewport). */
  filter?: string;
  depth?: number;
  /** Scope an outline to this element's subtree. */
  ref?: string;
  /** find: what to look for. */
  query?: string;
}

export const SNAPSHOT_SCRIPT = String.raw`(opts) => {
  const MAX = 50000;
  const INTERACTIVE = new Set(["link","button","textbox","searchbox","checkbox","radio","combobox","listbox","option","menuitem","menuitemcheckbox","menuitemradio","tab","switch","slider","spinbutton","clickable"]);
  const LANDMARK = new Set(["heading","img","dialog","alert","navigation","main","form","table","row","cell","columnheader","list","listitem","paragraph","region","banner","contentinfo","status"]);
  const TAG = { BUTTON:"button", SELECT:"combobox", TEXTAREA:"textbox", IMG:"img", H1:"heading", H2:"heading", H3:"heading", H4:"heading", H5:"heading", H6:"heading", NAV:"navigation", MAIN:"main", FORM:"form", TABLE:"table", TR:"row", TD:"cell", TH:"columnheader", UL:"list", OL:"list", LI:"listitem", P:"paragraph", DIALOG:"dialog", OPTION:"option", SUMMARY:"button", HEADER:"banner", FOOTER:"contentinfo" };
  const clean = (s, n) => (s || "").replace(/\s+/g, " ").trim().slice(0, n || 100);

  const state = (window.__relayRefs = window.__relayRefs || { n: 0 });
  const refOf = (el) => {
    let r = el.getAttribute("data-relay-ref");
    if (!r) { state.n += 1; r = "ref_" + state.n; el.setAttribute("data-relay-ref", r); }
    return r;
  };

  function inputRole(el) {
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (t === "hidden") return null;
    if (t === "checkbox" || t === "radio") return t;
    if (["button","submit","reset","image"].includes(t)) return "button";
    if (t === "search") return "searchbox";
    if (t === "range") return "slider";
    if (t === "number") return "spinbutton";
    return "textbox";
  }
  function roleOf(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit.split(" ")[0];
    if (el.tagName === "A") return el.hasAttribute("href") ? "link" : null;
    if (el.tagName === "INPUT") return inputRole(el);
    if (TAG[el.tagName]) return TAG[el.tagName];
    if (el.isContentEditable && el.parentElement && !el.parentElement.isContentEditable) return "textbox";
    const style = getComputedStyle(el);
    if (style.cursor === "pointer" && el.parentElement && getComputedStyle(el.parentElement).cursor !== "pointer") return "clickable";
    return null;
  }
  function visible(el) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function inView(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }
  function labelText(el) {
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((n) => n.innerText).join(" ");
      if (clean(t)) return clean(t);
    }
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l && clean(l.innerText)) return clean(l.innerText);
    }
    const wrap = el.closest("label");
    if (wrap && clean(wrap.innerText)) return clean(wrap.innerText);
    return "";
  }
  const CONTAINERS = new Set(["main","navigation","form","region","banner","contentinfo","list","table","row","dialog","listbox"]);
  function nameOf(el, role) {
    const aria = el.getAttribute("aria-label");
    if (aria && clean(aria)) return clean(aria);
    // Containers are named by their label only; their text belongs to what's inside.
    if (CONTAINERS.has(role)) return labelText(el);
    if (["textbox","searchbox","combobox","checkbox","radio","spinbutton","slider","switch"].includes(role)) {
      return labelText(el) || clean(el.getAttribute("placeholder")) || clean(el.getAttribute("title")) || clean(el.getAttribute("name"));
    }
    if (el.tagName === "INPUT") return clean(el.value) || clean(el.getAttribute("title"));
    if (el.tagName === "IMG") return clean(el.getAttribute("alt")) || clean(el.getAttribute("title"));
    const text = clean(el.innerText, 120);
    if (text) return text;
    const img = el.querySelector && el.querySelector("img[alt]");
    return clean((img && img.getAttribute("alt")) || el.getAttribute("title"));
  }
  function extra(el, role) {
    const bits = [];
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const t = (el.getAttribute("type") || "").toLowerCase();
      if (role === "checkbox" || role === "radio") bits.push(el.checked ? "checked" : "unchecked");
      else if (t === "password") bits.push(el.value ? 'value="••••"' : "empty");
      else if (el.value) bits.push('value="' + clean(el.value, 80) + '"');
    }
    if (el.tagName === "SELECT") {
      const o = el.options[el.selectedIndex];
      if (o) bits.push('selected="' + clean(o.text, 60) + '"');
    }
    if (el.disabled || el.getAttribute("aria-disabled") === "true") bits.push("disabled");
    if (el.getAttribute("aria-expanded")) bits.push("expanded=" + el.getAttribute("aria-expanded"));
    if (role === "link") {
      const href = el.getAttribute("href") || "";
      if (href && !href.startsWith("javascript:")) bits.push('href="' + clean(href, 80) + '"');
    }
    return bits.length ? " " + bits.join(" ") : "";
  }

  if (opts.mode === "text") {
    const root = document.querySelector("main, article, [role=main]") || document.body;
    const text = (root.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
    return text.length > MAX ? text.slice(0, MAX) + "\n[truncated]" : text || "(The page has no visible text.)";
  }

  const filter = opts.filter || "visible";
  const maxDepth = Math.max(1, opts.depth || 15);
  const lines = [];
  let size = 0;
  let truncated = false;
  const root = opts.ref ? document.querySelector('[data-relay-ref="' + opts.ref + '"]') : document.body;
  if (!root) return "No element " + opts.ref + " on this page. Read the page again for fresh references.";

  function walk(el, depth) {
    if (truncated || depth > maxDepth + 20) return;
    if (!(el instanceof Element) || !visible(el)) return;
    const role = roleOf(el);
    let emitted = false;
    const keep = role && (INTERACTIVE.has(role) || (filter !== "interactive" && LANDMARK.has(role)));
    if (keep && (filter !== "visible" || inView(el))) {
      const name = nameOf(el, role);
      if (INTERACTIVE.has(role) || name) {
        const line = "  ".repeat(Math.min(depth, maxDepth)) + role + (name ? ' "' + name.replace(/"/g, "'") + '"' : "") + extra(el, role) + " [" + refOf(el) + "]";
        size += line.length + 1;
        if (size > MAX) { truncated = true; return; }
        lines.push(line);
        emitted = true;
      }
    }
    // A named control's children rarely add anything (a button's inner span).
    if (emitted && INTERACTIVE.has(role) && role !== "clickable" && role !== "listbox" && role !== "combobox") return;
    for (const child of el.children) walk(child, emitted ? depth + 1 : depth);
    if (el.shadowRoot) for (const child of el.shadowRoot.children) walk(child, depth);
  }
  walk(root, 0);

  if (opts.mode === "find") {
    const words = (opts.query || "").toLowerCase().split(/[^a-z0-9$.]+/).filter((w) => w.length > 1);
    const scored = lines
      .map((l) => {
        const t = l.trim();
        const role = t.split(" ")[0];
        return { l: t, s: words.reduce((n, w) => n + (t.toLowerCase().includes(w) ? 1 : 0), 0), i: INTERACTIVE.has(role) ? 1 : 0 };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.i - a.i || a.l.length - b.l.length)
      .slice(0, 20);
    return scored.length ? scored.map((x) => x.l).join("\n") : "Nothing on the page matches that. Try read_page or scroll.";
  }
  if (!lines.length) return filter === "visible" ? "Nothing interactive is in view. Scroll, or read the page with filter all." : "The page has no readable elements.";
  return lines.join("\n") + (truncated ? "\n[truncated at 50,000 characters; read a smaller part with ref]" : "");
}`;
