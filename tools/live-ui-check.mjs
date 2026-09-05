/**
 * Drive the in-progress UI without spending a single Gonka inference.
 *
 * The working indicator's whole job is to show probes landing one at a time, and
 * the interesting frame is the half-filled one — a few seats back, the rest
 * still waiting, the sweep somewhere between them. Catching that against the
 * live router is luck: prep alone can take longer than the whole screenshot
 * window, and three runs in a row were captured at 0 of 9.
 *
 * So `/api/verify` is stubbed in the page with a stream replayed from a run that
 * already happened, paced to land one probe at a time. Everything above the
 * network is the real thing: the real component, the real SSE parsing, the real
 * state machine, the real sphere.
 *
 * Usage:
 *   node tools/live-ui-check.mjs <outDir> [runId] [probesToLand] [width]
 *
 * With no runId it replays the most recent run in `.runs/`.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "google-chrome");

const outDir = process.argv[2] || "evidence/iteration";
const runId = process.argv[3] || undefined;
const landCount = Number(process.argv[4] || 4);
const width = Number(process.argv[5] || 1536);
mkdirSync(outDir, { recursive: true });

const RUN_DIR = path.join(process.cwd(), ".runs");
const file =
  (runId && runId.length > 0 ? runId : null) ??
  readdirSync(RUN_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, t: statSync(path.join(RUN_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].f.replace(/\.json$/, "");
const run = JSON.parse(readFileSync(path.join(RUN_DIR, `${file}.json`), "utf8")).run;
if (!run) throw new Error(`no usable run in .runs/${file}.json`);

// Exactly the events the real route emits, in the real order, from real data.
const frames = [
  { type: "stage", stage: "prep", detail: "Isolating the checkable claim" },
  { type: "prep", prep: run.prep },
  { type: "stage", stage: "probe", detail: "Probing 3 models three ways each, in parallel across Gonka nodes" },
  ...run.probes.slice(0, landCount).flatMap((probe) => [
    { type: "receipt", receipt: run.receipts[probe.receiptIndex] ?? run.receipts[0] },
    { type: "probe", probe },
  ]),
];

const port = 9910 + Math.floor(Math.random() * 80);
const chrome = spawn(CHROME, [
  "--headless=new",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${process.env.TEMP || "/tmp"}/neff-liveui-${Date.now()}`,
  `--window-size=${width},1000`,
  "about:blank",
]);
chrome.stderr.on("data", () => {});

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const p = (await r.json()).find((t) => t.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("chrome did not come up");
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result ?? m.error);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
    consoleErrors.push(`${m.params.type}: ${(m.params.args || []).map((a) => a.value).join(" ")}`);
  }
  if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`exception: ${m.params.exceptionDetails?.exception?.description}`);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))?.result
    ?.value;

await send("Page.enable");
await send("Runtime.enable");

// The stub is installed before any of the page's own script runs, and it only
// intercepts /api/verify. The stream never closes, so the run stays in flight
// for as long as the screenshot needs.
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    const FRAMES = ${JSON.stringify(frames)};
    const realFetch = window.fetch;
    window.fetch = (input, init) => {
      if (!String(typeof input === 'string' ? input : input.url).includes('/api/verify')) {
        return realFetch(input, init);
      }
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        async start(controller) {
          for (const frame of FRAMES) {
            controller.enqueue(encoder.encode('data: ' + JSON.stringify(frame) + '\\n\\n'));
            await new Promise((r) => setTimeout(r, 220));
          }
          // Deliberately left open: the point is the in-progress state.
        },
      });
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  `,
});

await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(3500);

console.log(
  "submitted:",
  await evaluate(`(() => {
    const ta = document.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(run.prep.claim.slice(0, 200))});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const b = document.querySelector('button[type="submit"]');
    if (!b || b.disabled) return 'verify button unavailable';
    b.click();
    return 'clicked verify';
  })()`),
);

await sleep(220 * frames.length + 1200);

console.log(
  "sphere:",
  await evaluate(`JSON.stringify({
    centreReads: (document.querySelector('[class*="orbWorking"]')||{}).innerText || null,
    running: document.getAnimations()
      .filter(a => a.playState === 'running')
      .map(a => a.animationName || '')
      .filter(n => /spin|seatWait|seatLand|seatFlash|core/.test(n))
      .reduce((acc, n) => { acc[n] = (acc[n] || 0) + 1; return acc; }, {}),
  })`),
);

const shot = await send("Page.captureScreenshot", { format: "png" });
const outFile = path.join(outDir, "live-half-filled.png");
writeFileSync(outFile, Buffer.from(shot.data, "base64"));
console.log("shot:", outFile);
console.log("replayed from:", `/r/${file}`, `${landCount} of ${run.probes.length} probes`);
console.log("consoleErrors:", JSON.stringify(consoleErrors));

ws.close();
chrome.kill();
