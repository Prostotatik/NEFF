/**
 * Zoom into a region of a PNG and write it out as its own image.
 *
 * The redesign brief requires re-viewing the specific part of
 * visual-reference.png before building each section, and the full 1536×1830
 * reference loses fine detail (glow falloff, hairline borders, letter spacing)
 * when viewed whole. This crops a region and scales it up so those details are
 * actually legible.
 *
 * Usage:
 *   node tools/crop.mjs <src.png> <out.png> <x> <y> <w> <h> [scale]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "google-chrome");

const [src, out, xArg, yArg, wArg, hArg, scaleArg] = process.argv.slice(2);
const x = Number(xArg);
const y = Number(yArg);
const w = Number(wArg);
const h = Number(hArg);
const scale = Number(scaleArg || 1);
mkdirSync(path.dirname(out), { recursive: true });

const dataUri = `data:image/png;base64,${readFileSync(src).toString("base64")}`;
const html = `<style>html,body{margin:0;background:#000;overflow:hidden}
img{position:absolute;image-rendering:auto;transform-origin:0 0;
transform:scale(${scale}) translate(${-x}px,${-y}px)}</style><img src="${dataUri}">`;
const htmlFile = `${process.env.TEMP || "/tmp"}/neff-crop-${Date.now()}.html`;
writeFileSync(htmlFile, html, "utf8");

const port = 9800 + Math.floor(Math.random() * 150);
const profile = `${process.env.TEMP || "/tmp"}/neff-crop-${Date.now()}`;
const chrome = spawn(CHROME, [
  "--headless=new",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${Math.round(w * scale)},${Math.round(h * scale)}`,
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
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result ?? msg.error);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: Math.round(w * scale),
  height: Math.round(h * scale),
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: `file:///${htmlFile.replace(/\\/g, "/")}` });
await sleep(1400);
const r = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(r.data, "base64"));
console.log(out, `${Math.round(w * scale)}x${Math.round(h * scale)}`);
ws.close();
chrome.kill();
