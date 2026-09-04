/**
 * Browser check: drives the real app in headless Chrome and reports what it saw.
 *
 * Quorum's verification standard is that a feature is not verified until it has
 * been exercised in the running app, so this clicks the actual buttons, watches
 * the stream arrive, records console errors, and screenshots the result — rather
 * than asserting against the source.
 *
 * Usage:
 *   node tools/browser-check.mjs <outDir> [width] [height] [claim] [midRunDelayMs]
 *
 * With no claim it clicks the first example chip. With a claim it types that
 * into the textarea and presses Verify, which is the uncached path and the one
 * that shows the streaming state.
 *
 * Needs Chrome installed and the app running on :3000 (./init.sh).
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
const outDir = process.argv[2] || ".";
const width = Number(process.argv[3] || 1440);
const height = Number(process.argv[4] || 1000);
mkdirSync(outDir, { recursive: true });

const profile = `${process.env.TEMP}/quorum-cdp-${Date.now()}`;
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--remote-debugging-port=9333",
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  "about:blank",
]);
chrome.stderr.on("data", () => {});

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9333/json/list");
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
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
    consoleErrors.push(`${msg.params.type}: ${(msg.params.args || []).map((a) => a.value ?? a.description).join(" ")}`);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`exception: ${msg.params.exceptionDetails?.exception?.description ?? "unknown"}`);
  }
});

const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};

const shot = async (name, fullPage = false) => {
  const r = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: fullPage,
  });
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.data, "base64"));
  return `${outDir}/${name}.png`;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(3500);
console.log("landing loaded");

// Click the first example chip — the literal user action.
const claim = process.argv[5];
if (claim) {
  const typed = await evaluate(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return 'no textarea';
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(claim)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return 'typed';
  })()`);
  console.log(typed);
  await sleep(400);
  console.log(await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Verify');
    if (!b) return 'no verify button';
    if (b.disabled) return 'verify still disabled';
    b.click();
    return 'clicked Verify';
  })()`));
} else {
  console.log(await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const chip = buttons.find(b => b.textContent.includes('Taking vitamin C'));
    if (!chip) return 'chip not found';
    chip.click();
    return 'clicked: ' + chip.textContent.trim();
  })()`));
}

await sleep(Number(process.argv[6] || 2500));
console.log("mid-run shot:", await shot("live-mid-run"));
console.log(
  "probe cells landed at 2.5s:",
  await evaluate(`document.querySelectorAll('[class*="probeCell"]:not([class*="Pending"])').length`),
);

// Wait for the verdict to appear.
let waited = 0;
while (waited < 180) {
  const done = await evaluate(`Boolean(document.body.innerText.match(/credible band/))`);
  if (done) break;
  await sleep(2000);
  waited += 2;
}
console.log("verdict appeared after", waited, "s");

await sleep(1500);
console.log("report shot:", await shot("report-full", true));
console.log("permalink:", await evaluate(`(document.querySelector('a[href^="/r/"]')||{}).getAttribute?.('href')`));
console.log("headline:", await evaluate(`(document.querySelector('[class*="headline"]')||{}).innerText`));
console.log("console errors:", JSON.stringify(consoleErrors, null, 1));

ws.close();
chrome.kill();
