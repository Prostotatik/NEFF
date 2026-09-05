/**
 * Exercises the idle rail the way a visitor would, in a real browser.
 *
 * The two lists it shows behave differently on purpose — a popular claim fills
 * the box and stops, a recent check opens that run's stored report — and neither
 * behaviour is something source code or a unit test can vouch for. This clicks
 * them and reports what actually happened: whether the box was filled, whether
 * anything was submitted that should not have been, and whether the report that
 * opened is the one the row named.
 *
 * Costs no Gonka inferences: it never submits.
 *
 * Usage: node tools/idle-check.mjs [width]
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

const width = Number(process.argv[2] || 1536);
const port = 9750 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, [
  "--headless=new",
  "--hide-scrollbars",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${process.env.TEMP || "/tmp"}/quorum-idle-${Date.now()}`,
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
const verifyRequests = [];
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
  // The point of "fills the box, does not submit" is that no verification is
  // started, so the network is where that claim is actually checked.
  if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/verify")) {
    verifyRequests.push(m.params.request.url);
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
await send("Network.enable");

const settle = "await new Promise(r => setTimeout(r, 500));";
const results = {};

await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(4500);

results.idlePanel = await evaluate(`(() => {
  const text = document.body.innerText;
  return {
    showsAlreadyChecked: text.includes('Already checked here'),
    // The panel it replaces. Its presence at idle is the defect being fixed.
    stillShowsVerificationDetails: text.includes('Verification Details'),
    tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.innerText),
    rows: document.querySelectorAll('[role="tabpanel"] > *').length,
  };
})()`);

results.popularFillsTheBox = await evaluate(`(async () => {
  const row = document.querySelector('[role="tabpanel"] button');
  if (!row) return 'no popular row found';
  const box = document.querySelector('textarea');
  const before = box.value;
  const rowText = row.innerText.split('\\n')[0];
  row.click();
  ${settle}
  return {
    boxWasEmpty: before === '',
    boxNowHas: box.value,
    boxIsFocused: document.activeElement === box,
    rowSaid: rowText,
    // Filling the box must not start a run: the verify button is the user's.
    stillOnLandingPage: location.pathname === '/',
    reportOnScreen: document.body.innerText.includes('credible band'),
  };
})()`);

results.tabSwitch = await evaluate(`(async () => {
  const recent = [...document.querySelectorAll('[role="tab"]')].find((t) => /recent/i.test(t.innerText));
  if (!recent) return 'no recent tab';
  recent.click();
  ${settle}
  const rows = [...document.querySelectorAll('[role="tabpanel"] a')];
  return {
    selected: recent.getAttribute('aria-selected'),
    linkRows: rows.length,
    firstHref: rows[0]?.getAttribute('href') ?? null,
    firstClaim: rows[0]?.innerText.split('\\n')[0] ?? null,
  };
})()`);

const href = results.tabSwitch?.firstHref;
if (href) {
  const expectedClaim = results.tabSwitch.firstClaim;
  await evaluate(`document.querySelector('[role="tabpanel"] a').click()`);
  await sleep(4000);
  const needle = JSON.stringify((expectedClaim || "").slice(0, 40).toLowerCase());
  results.recentOpensTheRealReport = await evaluate(`(() => {
    // innerText reflects text-transform, and these labels are uppercased in
    // CSS, so every match here is case-insensitive or it reports a rendered
    // report as empty.
    const flat = document.body.innerText.toLowerCase();
    return {
      landedOn: location.pathname,
      hasVerdict: /\\d+\\/100/.test(flat),
      hasCredibleBand: flat.includes('credible band'),
      hasReceipts: flat.includes('gonka request id') || flat.includes('req-'),
      effectiveWitnessesShown: flat.includes('effective witnesses'),
      // The decisive check: the report that opened is about the claim the row
      // named, rather than some other stored run or a fresh re-run of it.
      showsTheRowsClaim: flat.includes(${needle}),
    };
  })()`);
  results.recentOpensTheRealReport.expectedHref = href;
  results.recentOpensTheRealReport.rowClaimPrefix = (expectedClaim || "").slice(0, 40);
}

results.verifyRequestsFired = verifyRequests.length;
results.consoleErrors = consoleErrors;

console.log(JSON.stringify(results, null, 1));
ws.close();
chrome.kill();
