/**
 * Drive one real verification through the running app and report what the nine
 * probes actually did.
 *
 * This exists because the failures that matter — a probe lost to the router's
 * cold tail, an answer the parser could not read, evidence a model named while
 * thinking and then left out of its answer — are invisible in a green unit test
 * and only show up against the live router. It streams the same SSE the browser
 * consumes, so what it reports is what the page would have rendered.
 *
 * Usage:
 *   node tools/run-claim.mjs "a claim to check" [baseUrl]
 *   node tools/run-claim.mjs --suite [baseUrl]        the standard four
 *
 * `/api/verify` meters a client at six runs a minute, so back-to-back suite
 * passes will start answering 429 unless they are spaced. The suite waits
 * between claims for that reason; do not remove it and then read the 429s as a
 * product failure, which is exactly what happened once.
 */
const SUITE = [
  "Taking vitamin C supplements prevents the common cold.",
  "The Great Wall of China is visible from the Moon with the naked eye.",
  "Norway's sovereign wealth fund owns roughly 1.5% of all listed companies worldwide.",
  "The Anglo-Zanzibar War of 1896 lasted less than 45 minutes.",
];

const args = process.argv.slice(2);
const suite = args[0] === "--suite";
const claims = suite ? SUITE : [args[0]];
const base = (suite ? args[1] : args[1]) || "http://localhost:3000";

if (!claims[0]) {
  console.error('usage: node tools/run-claim.mjs "claim" [baseUrl]  |  --suite [baseUrl]');
  process.exit(2);
}

let totalProbes = 0;
let totalFailed = 0;
let totalRecovered = 0;
let totalThinking = 0;

const PACE_MS = 11_000;

for (const [index, claim] of claims.entries()) {
  if (index > 0) await new Promise((r) => setTimeout(r, PACE_MS));
  const started = Date.now();
  const response = await fetch(`${base}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: claim }),
  });

  if (!response.ok || !response.body) {
    console.log(`\n=== ${claim}\n    HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
    continue;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const probes = [];
  const receipts = [];
  let run = null;
  let error = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      if (!frame.startsWith("data: ")) continue;
      let event;
      try {
        event = JSON.parse(frame.slice(6));
      } catch {
        continue;
      }
      if (event.type === "probe") probes.push(event.probe);
      if (event.type === "receipt") receipts.push(event.receipt);
      if (event.type === "done") run = event.run;
      if (event.type === "error") error = event.message;
    }
  }

  console.log(`\n=== ${claim}`);
  if (error) {
    console.log(`    run error: ${error}`);
    continue;
  }
  console.log(`    ${((Date.now() - started) / 1000).toFixed(1)}s wall · ${receipts.length} inferences`);

  for (const p of probes) {
    totalProbes++;
    if (p.status === "failed") totalFailed++;
    if (p.recovered) totalRecovered++;
    if (p.thinking) totalThinking++;
    const answer =
      p.status === "failed"
        ? `FAILED — ${p.error}`
        : p.kind === "anchor"
          ? `${(p.anchors ?? []).length} anchors`
          : `${p.stance} @ ${p.confidence}`;
    console.log(
      `    ${p.modelId.split("/")[1].padEnd(24)} ${p.kind.padEnd(7)} ${answer.padEnd(46)}` +
        `${p.recovered ? " [recovered from its reasoning]" : ""}` +
        `${p.thinking ? ` [working ${p.thinking.length}ch]` : " [no working kept]"}`,
    );
  }

  for (const r of receipts.filter((r) => r.attempts > 1 || r.status === "error")) {
    console.log(
      `      receipt ${r.purpose.padEnd(11)} ${r.model.split("/")[1].padEnd(24)} ` +
        `attempts=${r.attempts} ${(r.latencyMs / 1000).toFixed(1)}s ${r.status}` +
        `${r.error ? ` — ${r.error}` : ""}`,
    );
  }

  if (run) {
    console.log(
      `    verdict ${run.verdict.truthScore}/100 ${run.verdict.label} · ` +
        `${run.consensus.nominalAgree}/${run.consensus.respondents} nominal · ` +
        `${run.consensus.effectiveWitnesses} effective · /r/${run.id}`,
    );
  }
}

console.log(
  `\nprobes=${totalProbes} failed=${totalFailed} recovered=${totalRecovered} withWorking=${totalThinking}`,
);
