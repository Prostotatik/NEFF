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
const profile = `${process.env.TEMP || "/tmp"}/quorum-shot-${Date.now()}`;
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
const nav = await send("Page.navigate", { url: `http://localhost:3000${urlPath}` });
if (nav?.errorText || !nav?.frameId) console.error("navigate:", JSON.stringify(nav));
await sleep(settle);
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
    expression: `JSON.stringify({url:location.href,title:document.title,text:document.body.innerText.length,h:document.documentElement.scrollHeight})`,
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
