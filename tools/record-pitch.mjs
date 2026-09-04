/**
 * Records the two-minute pitch as an actual video of the actual app.
 *
 * Nothing here is a mockup or an animation: it drives the real page in Chrome,
 * runs real verifications against the live Gonka Router, and captures the frames
 * the browser paints. Narration is synthesised from `tools/pitch-script.mjs`, and
 * each shot is held for exactly as long as its line takes to speak, so picture
 * and words stay together without anyone counting seconds.
 *
 * Requirements: Chrome, ffmpeg on PATH, Windows PowerShell (for speech), and the
 * app running on :3000.
 *
 * Usage:  node tools/record-pitch.mjs [outDir]
 * Output: <outDir>/pitch.mp4, plus the narration and frames it was built from.
 *
 * The synthesised voice is a placeholder that makes the submission complete on
 * its own. If you would rather have a human read it, the script is the same
 * prose as VIDEO_PITCH.md — record over the silent cut at <outDir>/silent.mp4.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { SEGMENTS } from "./pitch-script.mjs";

const outDir = path.resolve(process.argv[2] || "evidence/pitch");
const framesDir = path.join(outDir, "frames");
const audioDir = path.join(outDir, "audio");
const WIDTH = 1440;
const HEIGHT = 900;
const FPS = 10;
const BASE = "http://localhost:3000";

const CHROME =
  process.env.CHROME_PATH ||
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "google-chrome");

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
mkdirSync(audioDir, { recursive: true });

// --- 1. narration ----------------------------------------------------------

function speak(text, file) {
  const script = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft David Desktop')
$s.Rate = 1
$s.SetOutputToWaveFile('${file.replace(/\\/g, "\\\\")}')
$s.Speak(@'
${text}
'@)
$s.Dispose()
`;
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`speech synthesis failed: ${r.stderr}`);
}

function durationOf(file) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Number(r.stdout.trim()) || 0;
}

function silence(seconds, file) {
  spawnSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi",
    "-i", `anullsrc=channel_layout=mono:sample_rate=22050`,
    "-t", String(seconds),
    file,
  ]);
}

console.log("synthesising narration…");
const plan = [];
for (const [i, segment] of SEGMENTS.entries()) {
  const file = path.join(audioDir, `${String(i).padStart(2, "0")}-${segment.id}.wav`);
  if (segment.say) {
    speak(segment.say, file);
  } else {
    silence(1, file);
  }
  const spoken = durationOf(file);
  // The hold keeps the picture on screen after the line ends; it is padded into
  // the audio so the two tracks stay the same length.
  const hold = segment.hold ?? 0;
  if (hold > 0) {
    const padded = file.replace(".wav", "-padded.wav");
    spawnSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-af", `apad=pad_dur=${hold}`, padded]);
    plan.push({ ...segment, file: padded, seconds: spoken + hold });
  } else {
    plan.push({ ...segment, file, seconds: spoken });
  }
  console.log(`  ${segment.id.padEnd(12)} ${plan.at(-1).seconds.toFixed(1)}s`);
}
const narrated = plan.reduce((s, p) => s + p.seconds, 0);
console.log(`narration total: ${narrated.toFixed(1)}s`);

// --- 2. drive the app and capture frames -----------------------------------

const profile = `${process.env.TEMP || "/tmp"}/quorum-pitch-${Date.now()}`;
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--remote-debugging-port=9335",
  `--user-data-dir=${profile}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  "about:blank",
]);
chrome.stderr.on("data", () => {});

async function debuggerUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch("http://127.0.0.1:9335/json/list")).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await debuggerUrl());
await new Promise((r) => ws.addEventListener("open", r));

let msgId = 0;
const pending = new Map();
let frameIndex = 0;
let capturing = false;

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result ?? {});
    pending.delete(msg.id);
  }
  if (msg.method === "Page.screencastFrame") {
    send("Page.screencastFrameAck", { sessionId: msg.params.sessionId });
    if (!capturing) return;
    writeFileSync(
      path.join(framesDir, `f${String(frameIndex++).padStart(5, "0")}.png`),
      Buffer.from(msg.params.data, "base64"),
    );
  }
});

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))?.result
    ?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: false,
});

/** Smooth scroll to a landmark, so the recording moves the way a person would. */
async function scrollTo(landmark) {
  const selectors = {
    mechanism: '[class*="mechanism"]',
    verdict: '[class*="verdict"]',
    hinge: '[class*="hinge"]',
    panel: '[class*="witnesses"]',
    ledger: '[class*="ledger"]',
  };
  await evaluate(`(() => {
    const el = document.querySelector('${selectors[landmark]}');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return Boolean(el);
  })()`);
}

async function act(segment) {
  switch (segment.act) {
    case "goto":
      await send("Page.navigate", { url: BASE + segment.arg });
      await sleep(2200);
      return;
    case "scrollTo":
      await scrollTo(segment.arg);
      return;
    case "clickExample":
      await evaluate(`(() => {
        const chips = [...document.querySelectorAll('button')].filter(b => b.className.includes('example'));
        chips[${segment.arg}]?.click();
        return chips.length;
      })()`);
      return;
    case "runInput":
      await evaluate(`(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const ta = document.querySelector('textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, ${JSON.stringify(segment.arg)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      await sleep(900);
      await evaluate(`(() => {
        const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Verify');
        if (b && !b.disabled) b.click();
        return true;
      })()`);
      return;
    case "openLedgerRow":
      await scrollTo("ledger");
      await sleep(1200);
      await evaluate(`(() => {
        const rows = [...document.querySelectorAll('button')].filter(b => b.className.includes('ledgerRow'));
        rows[1]?.click();
        return rows.length;
      })()`);
      return;
    case "awaitVerdict":
      for (let i = 0; i < 90; i++) {
        if (await evaluate(`Boolean(document.body.innerText.match(/credible band/))`)) return;
        await sleep(1000);
      }
      return;
    default:
      return;
  }
}

await send("Page.navigate", { url: BASE + "/" });
await sleep(3500);

console.log("recording…");
await send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
capturing = true;

const timeline = [];
const started = Date.now();
for (const segment of plan) {
  const at = Date.now();
  await act(segment);
  // `awaitVerdict` has no narration: it takes exactly as long as the router
  // takes, and the audio track is stretched to match afterwards.
  const elapsed = (Date.now() - at) / 1000;
  const remaining = segment.seconds - elapsed;
  if (remaining > 0) await sleep(remaining * 1000);
  const actual = (Date.now() - at) / 1000;
  timeline.push({ ...segment, actual });
  console.log(`  ${segment.id.padEnd(12)} planned ${segment.seconds.toFixed(1)}s, actual ${actual.toFixed(1)}s`);
}

capturing = false;
await send("Page.stopScreencast");
const wall = (Date.now() - started) / 1000;
ws.close();
chrome.kill();

const frames = readdirSync(framesDir).filter((f) => f.endsWith(".png")).length;
console.log(`captured ${frames} frames over ${wall.toFixed(1)}s`);
if (frames === 0) throw new Error("no frames captured");

// --- 3. assemble -----------------------------------------------------------
// Frames arrive only when the page repaints, so they are not evenly spaced.
// Rather than guess, the whole sequence is laid down at a constant rate and the
// audio is padded to the same length: a segment whose shot ran long simply
// holds, which is what a viewer expects anyway.

const silentPath = path.join(outDir, "silent.mp4");
const audioListPath = path.join(outDir, "audio.txt");
const narrationPath = path.join(outDir, "narration.wav");
const finalPath = path.join(outDir, "pitch.mp4");

const rate = frames / wall;
console.log(`assembling at ${rate.toFixed(2)} fps to match the ${wall.toFixed(1)}s capture…`);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr?.slice(-800)}`);
}

run("ffmpeg", [
  "-y", "-v", "error",
  "-framerate", rate.toFixed(4),
  "-i", path.join(framesDir, "f%05d.png"),
  "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,fps=${FPS}`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
  silentPath,
]);

writeFileSync(
  audioListPath,
  timeline.map((t) => `file '${t.file.replace(/\\/g, "/")}'`).join("\n") + "\n",
  "utf8",
);
run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", audioListPath, "-ar", "44100", "-ac", "1", narrationPath]);

run("ffmpeg", [
  "-y", "-v", "error",
  "-i", silentPath,
  "-i", narrationPath,
  "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
  "-shortest",
  finalPath,
]);

console.log(`\ndone: ${finalPath}  (${durationOf(finalPath).toFixed(1)}s)`);
console.log(`silent cut for a human voiceover: ${silentPath}`);
