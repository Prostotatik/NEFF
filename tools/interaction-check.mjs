/**
 * Clicks the interactive parts of a stored report and reports what appeared.
 *
 * The visual rebuild moved three things behind a click — each witness's full
 * answer, the closing note when it runs long, and every ledger row's raw
 * request and response. Content that used to be on the page and is now one click
 * away is only "still there" if the click actually works, and no unit test can
 * say that. Run against a stored run so it costs no Gonka inferences.
 *
 * Usage: node tools/interaction-check.mjs /r/<id> [width]
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "google-chrome");

const urlPath = process.argv[2] || "/";
const width = Number(process.argv[3] || 1536);
const port = 9600 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, [
  "--headless=new",
  "--hide-scrollbars",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${process.env.TEMP || "/tmp"}/neff-ix-${Date.now()}`,
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
await send("Page.navigate", { url: `http://localhost:3000${urlPath}` });
await sleep(5000);

const results = {};
results.before = await evaluate("document.body.innerText.length");

// React re-renders on a later task than the click, so every one of these has to
// yield before it measures — reading synchronously reports "nothing happened"
// for a disclosure that works perfectly.
const settle = "await new Promise(r => setTimeout(r, 400));";

results.witnessDisclosure = await evaluate(`(async () => {
  const b = [...document.querySelectorAll('button')].find(b => /what it actually said/i.test(b.textContent));
  if (!b) return 'toggle not found';
  const before = document.body.innerText.length;
  b.click();
  ${settle}
  return { grewBy: document.body.innerText.length - before, expanded: b.getAttribute('aria-expanded') };
})()`);

results.hingeDisclosure = await evaluate(`(async () => {
  const b = [...document.querySelectorAll('button')].find(b => /read the whole note/i.test(b.textContent));
  if (!b) return 'no clamped note on this run';
  const clampedHeight = b.previousElementSibling.getBoundingClientRect().height;
  b.click();
  ${settle}
  return {
    grewByPx: Math.round(b.previousElementSibling.getBoundingClientRect().height - clampedHeight),
    nowSays: b.textContent,
  };
})()`);

results.ledgerRow = await evaluate(`(async () => {
  const rows = [...document.querySelectorAll('button')].filter(b => /^req-|^—/.test(b.innerText.trim()) || b.innerText.includes('req-'));
  const row = rows.find(r => r.innerText.includes('req-')) || rows[0];
  if (!row) return 'no ledger row found';
  const before = document.body.innerText.length;
  row.click();
  ${settle}
  const after = document.body.innerText;
  // innerText reflects text-transform, and these labels are uppercased in CSS,
  // so the match has to be case-insensitive or it reports a working disclosure
  // as empty.
  const flat = after.toLowerCase();
  return {
    grewBy: after.length - before,
    showsRequest: flat.includes('request sent to gonkarouter.io'),
    showsResponse: flat.includes('raw response from the node'),
    expanded: row.getAttribute('aria-expanded'),
  };
})()`);

results.copyButtonsPresent = await evaluate(
  `document.querySelectorAll('button[title="copy"], button[title="copied"]').length`,
);
results.consoleErrors = consoleErrors;

console.log(JSON.stringify(results, null, 1));
ws.close();
chrome.kill();
