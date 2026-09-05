/**
 * What the anchor match threshold does to the numbers this app prints.
 *
 * `ANCHOR_MATCH_THRESHOLD` is the one judgement call in `lib/score.ts`, and a
 * judgement call inside a scoring function is exactly where a project quietly
 * tunes itself a better demo. So the argument for 0.6 in `METHOD.md` is not "it
 * seemed right": it is that a *looser* value finds more shared evidence, which
 * lowers the Effective Witness Count, which makes this project's whole claim —
 * that panel agreement is inflated — easier to demonstrate. 0.6 errs the other
 * way, against us.
 *
 * This reproduces that from the runs on disk, so nobody has to take it on trust.
 *
 *   node tools/threshold-sweep.mjs
 *
 * It reads `.runs/` and touches nothing, costs no Gonka inferences, and prints
 * the figures quoted in METHOD.md over whatever runs are present. The exact
 * numbers will drift as runs accumulate; the ordering is the claim.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const { anchorOverlap, anchorsMatch, effectiveWitnesses, ANCHOR_MATCH_THRESHOLD } = await import(
  new URL("../lib/score.ts", import.meta.url).href
);

const RUN_DIR = path.join(process.cwd(), ".runs");
const THRESHOLDS = [0.4, 0.5, 0.6, 0.7, 0.8];

let files = [];
try {
  files = readdirSync(RUN_DIR).filter((f) => f.endsWith(".json"));
} catch {
  console.error(`no ${RUN_DIR} to read; run a verification first`);
  process.exit(1);
}

const rows = [];
const pairs = new Set();

for (const file of files) {
  let run;
  try {
    run = JSON.parse(readFileSync(path.join(RUN_DIR, file), "utf8")).run;
  } catch {
    continue;
  }
  if (!run?.consensus || !run.witnesses) continue;

  // Every distinct cross-model anchor pair, for the corpus size quoted in the docs.
  const sets = run.witnesses.filter((w) => (w.anchors ?? []).length);
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      for (const a of sets[i].anchors) for (const b of sets[j].anchors) pairs.add(JSON.stringify([a, b]));
    }
  }

  // Only runs where two or more agreeing models both named evidence have an
  // overlap the threshold can change.
  const agreeing = run.witnesses.filter(
    (w) => w.stance && w.stance === run.consensus.majorityStance,
  );
  if (agreeing.length < 2) continue;
  if (agreeing.some((w) => (w.anchors ?? []).length === 0)) continue;

  const k = agreeing.reduce((sum, w) => sum + w.discrimination, 0);
  const row = { claim: (run.prep?.claim ?? "").slice(0, 44), k, at: {} };
  for (const t of THRESHOLDS) {
    const overlaps = [];
    for (let i = 0; i < agreeing.length; i++)
      for (let j = i + 1; j < agreeing.length; j++)
        overlaps.push(anchorOverlap(agreeing[i].anchors, agreeing[j].anchors, t));
    const rho = overlaps.reduce((s, o) => s + o, 0) / overlaps.length;
    row.at[t] = { rho, n: effectiveWitnesses(k, rho) };
  }
  rows.push(row);
}

console.log(`runs on disk: ${files.length}`);
console.log(`distinct cross-model anchor pairs: ${pairs.size}`);
console.log(`runs with a measurable agreeing pair: ${rows.length}`);
console.log(`threshold in use: ${ANCHOR_MATCH_THRESHOLD}`);

// Where those pairs actually fall. Printed because they do *not* separate into
// two clean clusters — which is why the threshold is a judgement call rather
// than something read off a graph, and why METHOD.md says so.
const buckets = new Map();
for (const key of pairs) {
  const [a, b] = JSON.parse(key);
  let highest = "0.0";
  for (const t of [0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
    if (anchorsMatch(a, b, t)) highest = t.toFixed(1);
  }
  buckets.set(highest, (buckets.get(highest) ?? 0) + 1);
}
const clearlyDifferent = [...buckets.entries()]
  .filter(([bucket]) => Number(bucket) < 0.4)
  .reduce((sum, [, n]) => sum + n, 0);
console.log(
  `highest threshold each pair still matches at: ${[...buckets.entries()]
    .sort()
    .map(([bucket, n]) => `${bucket}:${n}`)
    .join(" ")}`,
);
console.log(`pairs that match at no threshold above 0.4: ${clearlyDifferent}\n`);

if (rows.length === 0) {
  console.log("nothing to sweep yet — no stored run has two agreeing models that both named evidence");
  process.exit(0);
}

console.log("threshold   mean rho   mean effective witnesses");
for (const t of THRESHOLDS) {
  const rho = rows.reduce((s, r) => s + r.at[t].rho, 0) / rows.length;
  const n = rows.reduce((s, r) => s + r.at[t].n, 0) / rows.length;
  const mark = t === ANCHOR_MATCH_THRESHOLD ? "  <- in use" : "";
  console.log(`   ${t.toFixed(1)}      ${rho.toFixed(3)}      ${n.toFixed(3)}${mark}`);
}

console.log(
  "\nA lower threshold finds more shared evidence, so rho rises and the effective\n" +
    "witness count falls — a more striking headline every time. The value in use is\n" +
    "above the bottom of that range, which is the direction that costs us the story.",
);
