/**
 * Screenshot a running page at an exact width, for visual QA against
 * visual-reference.png.
 *
 * The redesign brief fixes the comparison width at 1536px — the reference
 * image's own width — so every QA screenshot is apples-to-apples. This exists
 * separately from browser-check.mjs because that one drives a live verification
 * (which costs Gonka inferences); this one only looks at pages that already
 * render from stored data.
 *
 * Usage:
 *   node tools/shot.mjs <outDir> <name> <path> [width] [fullPage] [settleMs]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "google-chrome");

const outDir = process.argv[2] || "evidence/visual";
const name = process.argv[3] || "shot";
const urlPath = process.argv[4] || "/";
const width = Number(process.argv[5] || 1536);
const fullPage = String(process.argv[6] ?? "true") === "true";
const settle = Number(process.argv[7] || 3500);
const height = Number(process.env.SHOT_HEIGHT || 1000);
mkdirSync(outDir, { recursive: true });

const port = 9400 + Math.floor(Math.random() * 400);
const profile = `${process.env.TEMP || "/tmp"}/neff-shot-${Date.now()}`;
const chrome = spawn(CHROME, [
  "--headless=new",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  "about:blank",
]);
chrome.stderr.on("data", () => {});

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const page = (await r.json()).find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome did not come up");
}

const ws = new WebSocket(await target());
await new Promise((res) => ws.addEventListener("open", res));

let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result ?? msg.error);
    pending.delete(msg.id);
  }
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
    consoleErrors.push(
      `${msg.params.type}: ${(msg.params.args || []).map((a) => a.value ?? a.description).join(" ")}`,
    );
  }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push(
      `exception: ${msg.params.exceptionDetails?.exception?.description ?? "unknown"}`,
    );
  }
});

const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await send("Page.enable");
await send("Runtime.enable");
// SHOT_REDUCED_MOTION=1 renders the page as a visitor who has asked their system
// to stop animations. The global rule that honours that is a wildcard, so it
// covers animations added later automatically — which is exactly the kind of
// claim that should be checked against the browser rather than trusted.
if (process.env.SHOT_REDUCED_MOTION) {
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
}
const nav = await send("Page.navigate", { url: `http://localhost:3000${urlPath}` });
if (nav?.errorText || !nav?.frameId) console.error("navigate:", JSON.stringify(nav));
await sleep(settle);

// Optional: open a disclosure before capturing. A collapsed panel screenshots as
// nothing, and several of the things worth reviewing — the arithmetic
// derivation, a witness's reasoning trace — only exist once something is
// clicked. SHOT_CLICK takes a CSS selector; SHOT_CLICK_TEXT matches the visible
// text of a button, which survives CSS-module class name hashing. Both accept
// several targets separated by "|", clicked in order, because some things are
// two disclosures deep.
const clickSelectors = (process.env.SHOT_CLICK || "").split("|").filter(Boolean);
const clickTexts = (process.env.SHOT_CLICK_TEXT || "").split("|").filter(Boolean);
for (const [clickSelector, clickText] of zip(clickSelectors, clickTexts)) {
  const clicked = (
    await send("Runtime.evaluate", {
      expression: `(() => {
        const bySelector = ${JSON.stringify(clickSelector)}
          ? document.querySelector(${JSON.stringify(clickSelector)})
          : null;
        // "some text#2" picks the second match. Several disclosures on this page
        // share their label — one per witness — and a plain first-match search
        // can only ever open the first one.
        const spec = ${JSON.stringify(clickText.toLowerCase())};
        const hash = spec.lastIndexOf('#');
        const needle = hash === -1 ? spec : spec.slice(0, hash);
        const nth = hash === -1 ? 1 : Number(spec.slice(hash + 1)) || 1;
        const byText = needle
          ? [...document.querySelectorAll('button, a, summary')].filter((el) =>
              (el.innerText || '').toLowerCase().includes(needle))[nth - 1]
          : null;
        const target = bySelector || byText;
        if (!target) return 'not found';
        target.click();
        return 'clicked: ' + (target.innerText || target.tagName).slice(0, 60);
      })()`,
      returnByValue: true,
    })
  )?.result?.value;
  console.error("click:", clicked);
  await sleep(900);
}

/** Pair up the two lists, padding the shorter with empty strings. */
function zip(a, b) {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => [a[i] ?? "", b[i] ?? ""]);
}

const shotHeight = Math.min(
  30000,
  Math.max(
    height,
    Math.ceil(
      (await send("Runtime.evaluate", {
        expression: "document.documentElement.scrollHeight",
        returnByValue: true,
      }))?.result?.value ?? height,
    ),
  ),
);
if (fullPage) {
  // Growing the emulated viewport is more reliable than captureBeyondViewport
  // here: position:fixed layers and viewport-unit sizing render correctly, and
  // headless still paints the whole document in one pass.
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: shotHeight,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(1200);
}

const r = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.data, "base64"));
const probe = (
  await send("Runtime.evaluate", {
    expression: `JSON.stringify({
      url: location.href,
      title: document.title,
      text: document.body.innerText.length,
      h: document.documentElement.scrollHeight,
      // Running animations, counted by name. The redesign brief requires that
      // everything the reference shows in motion is actually in motion, and a
      // declared @keyframes that never attaches proves nothing; this is the
      // browser's own list of animations it is currently ticking.
      running: Object.entries(
        document.getAnimations()
          .filter((a) => a.playState === "running")
          .reduce((acc, a) => {
            const n = a.animationName || "(unnamed)";
            acc[n] = (acc[n] || 0) + 1;
            return acc;
          }, {})
      ).sort((x, y) => y[1] - x[1]),
    })`,
    returnByValue: true,
  })
)?.result?.value;
console.log(
  JSON.stringify(
    {
      file: `${outDir}/${name}.png`,
      width,
      shotHeight,
      probe,
      consoleErrors,
    },
    null,
    1,
  ),
);

ws.close();
chrome.kill();
