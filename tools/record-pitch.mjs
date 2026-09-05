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
import { copyFileSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
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

const profile = `${process.env.TEMP || "/tmp"}/neff-pitch-${Date.now()}`;
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
    case "awaitVerdict": {
      const shows = () => evaluate(`document.body.innerText.includes("credible band")`);
      // The previous report is still on screen for a moment after Verify is
      // clicked; waiting for it to clear first stops this returning instantly
      // against the last run's verdict.
      for (let i = 0; i < 12 && (await shows()); i++) await sleep(300);
      // Generous on purpose. A congested router has been observed taking two
      // minutes for a run that normally takes twenty seconds, and the point of
      // the recording is a real verdict. The wait is timelapsed in the cut, so
      // being patient costs the finished video nothing.
      const ceilingSeconds = 240;
      for (let i = 0; i < ceilingSeconds; i++) {
        if (await shows()) return;
        await sleep(1000);
      }
      console.warn(`  (no verdict within ${ceilingSeconds}s; recording continues)`);
      return;
    }
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
const mismatches = [];
let firstFrame = 0;
const started = Date.now();
for (const segment of plan) {
  const at = Date.now();
  await act(segment);

  // A pre-recorded line must not talk over a screen showing something else.
  if (segment.expect) {
    const present = await evaluate(
      `document.body.innerText.includes(${JSON.stringify(segment.expect)})`,
    );
    if (!present) mismatches.push({ id: segment.id, expected: segment.expect });
  }
  // A wait segment takes as long as the router takes; its line is written to
  // cover that, and any remaining silence is padded in at the mux.
  const elapsed = (Date.now() - at) / 1000;
  const remaining = segment.seconds - elapsed;
  if (remaining > 0) await sleep(remaining * 1000);
  const actual = (Date.now() - at) / 1000;
  timeline.push({ ...segment, actual, firstFrame, lastFrame: frameIndex });
  firstFrame = frameIndex;
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
//
// Each segment gets exactly as many frames as its narration is long, so the
// picture and the words end together and the finished cut is the length of the
// script rather than the length of whatever the router did today.
//
// A segment that ran long is sampled evenly across its own frames rather than
// truncated: you still watch the probe grid fill, just faster. In practice only
// the two waiting stretches are ever compressed, and the counter on screen
// ("N of 11 inferences returned") tells the viewer exactly what is happening.
// A segment that ran short holds on its last frame. Every other second is real
// time. VIDEO_PITCH.md says so too.

const silentPath = path.join(outDir, "silent.mp4");
const audioListPath = path.join(outDir, "audio.txt");
const narrationPath = path.join(outDir, "narration.wav");
const finalPath = path.join(outDir, "pitch.mp4");
const cutDir = path.join(outDir, "cut");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr?.slice(-800)}`);
}

rmSync(cutDir, { recursive: true, force: true });
mkdirSync(cutDir, { recursive: true });

const framePath = (i) => path.join(framesDir, `f${String(i).padStart(5, "0")}.png`);
let out = 0;
let compressed = 0;

for (const segment of timeline) {
  const available = Math.max(0, segment.lastFrame - segment.firstFrame);
  const wanted = Math.max(1, Math.round(segment.seconds * FPS));
  if (available === 0) {
    // A screencast only emits a frame when the page repaints, so a line spoken
    // over a still screen produces none at all. Hold the last frame for the
    // whole line rather than flashing past it in a tenth of a second.
    const held = framePath(Math.max(0, segment.firstFrame - 1));
    for (let i = 0; i < wanted; i++) {
      copyFileSync(held, path.join(cutDir, `f${String(out++).padStart(5, "0")}.png`));
    }
    continue;
  }
  if (available > wanted * 1.25) compressed += segment.actual - segment.seconds;
  for (let i = 0; i < wanted; i++) {
    const source = segment.firstFrame + Math.min(available - 1, Math.floor((i * available) / wanted));
    copyFileSync(framePath(source), path.join(cutDir, `f${String(out++).padStart(5, "0")}.png`));
  }
}

console.log(
  `cut to ${out} frames at ${FPS}fps (${(out / FPS).toFixed(1)}s)` +
    (compressed > 1 ? `; ${compressed.toFixed(0)}s of waiting for the router is timelapsed` : ""),
);

run("ffmpeg", [
  "-y", "-v", "error",
  "-framerate", String(FPS),
  "-i", path.join(cutDir, "f%05d.png"),
  "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
  silentPath,
]);

writeFileSync(
  audioListPath,
  timeline.map((t) => `file '${t.file.replace(/\\/g, "/")}'`).join("\n") + "\n",
  "utf8",
);
run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", audioListPath, "-ar", "44100", "-ac", "1", narrationPath]);

// The narration is padded with silence rather than trimmed against the picture:
// a shot that ran long should hold quietly, not cut the end off the video.
run("ffmpeg", [
  "-y", "-v", "error",
  "-i", silentPath,
  "-i", narrationPath,
  "-filter_complex", "[1:a]apad[a]",
  "-map", "0:v", "-map", "[a]",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
  "-shortest",
  finalPath,
]);

const finalSeconds = durationOf(finalPath);
console.log(`\ndone: ${finalPath}  (${finalSeconds.toFixed(1)}s)`);
console.log(`silent cut for a human voiceover: ${silentPath}`);

if (mismatches.length > 0) {
  console.warn(
    `\nTHIS TAKE IS NOT USABLE AS NARRATED.\n` +
      mismatches
        .map(
          (m) =>
            `  segment "${m.id}" is narrated as if the page said "${m.expected}", and this run did not produce that.`,
        )
        .join("\n") +
      `\nThe models are not deterministic. Re-run for a take that matches, or use ${silentPath}\n` +
      `and read VIDEO_PITCH.md over it, saying the numbers that are actually on screen.`,
  );
}
if (finalSeconds > 150) {
  console.warn(`\nThat is over the brief two-minute target. Trim a line in tools/pitch-script.mjs.`);
}
