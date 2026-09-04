import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ASSUMED_OVERLAP,
  anchorOverlap,
  anchorsMatch,
  assessWitnesses,
  computeConsensus,
  computeVerdict,
  effectiveWitnesses,
  pairOverlap,
} from "../lib/score.ts";
import type { ProbeResult, Stance } from "../lib/types.ts";

const MODELS = ["model-a", "model-b", "model-c"];

interface Spec {
  model: string;
  direct?: Stance;
  confidence?: number;
  mirror?: Stance;
  anchors?: string[];
  missing?: boolean;
}

function probesFrom(specs: Spec[]): ProbeResult[] {
  const out: ProbeResult[] = [];
  let i = 0;
  for (const s of specs) {
    if (s.missing) continue;
    out.push({
      kind: "direct",
      modelId: s.model,
      status: "ok",
      stance: s.direct,
      confidence: s.confidence ?? 0.9,
      reasoning: "because",
      receiptIndex: i++,
    });
    if (s.mirror) {
      out.push({
        kind: "mirror",
        modelId: s.model,
        status: "ok",
        stance: s.mirror,
        confidence: 0.9,
        reasoning: "because",
        receiptIndex: i++,
      });
    }
    out.push({
      kind: "anchor",
      modelId: s.model,
      status: "ok",
      anchors: s.anchors ?? [],
      receiptIndex: i++,
    });
  }
  return out;
}

// --- anchor comparison -----------------------------------------------------

test("anchors naming the same source match despite wording differences", () => {
  assert.equal(
    anchorsMatch("WHO Global Tuberculosis Report 2023", "The 2023 Global Tuberculosis Report (WHO)"),
    true,
  );
});

test("the same evidence base described at different lengths still matches", () => {
  // Observed verbatim from three Gonka models on the same claim. If this is
  // read as three separate sources, an echo is reported as corroboration.
  assert.equal(
    anchorsMatch(
      "Cochrane systematic reviews of randomised controlled trials of vitamin C for preventing the common cold",
      "Cochrane systematic reviews of randomized placebo-controlled trials of vitamin C supplementation for common cold prevention",
    ),
    true,
  );
});

test("British and American spellings of the same source are one source", () => {
  assert.equal(
    anchorsMatch("randomised controlled trials of statin therapy", "randomized controlled trials of statin therapy"),
    true,
  );
});

test("two genuinely different sources in the same field still do not match", () => {
  assert.equal(
    anchorsMatch(
      "Cochrane systematic reviews of vitamin C trials",
      "US Department of Agriculture national nutrient database",
    ),
    false,
  );
});

test("anchors naming different sources do not match", () => {
  assert.equal(anchorsMatch("WHO Global Tuberculosis Report 2023", "US Census Bureau 2020 count"), false);
});

test("generic filler anchors do not count as shared evidence", () => {
  // Both are content-free; neither names a source, so neither should create
  // an overlap that silently deflates the witness count.
  assert.equal(anchorOverlap(["general knowledge"], ["public information"]), 0);
});

test("anchor overlap is normalised by the smaller evidence base", () => {
  const a = ["Reuters wire report, March 2024"];
  const b = ["Reuters wire report from March 2024", "Bloomberg terminal data"];
  assert.equal(anchorOverlap(a, b), 1);
});

// --- effective witness count ----------------------------------------------

test("three independent witnesses count as three", () => {
  assert.equal(effectiveWitnesses(3, 0), 3);
});

test("three witnesses reading the same page count as exactly one", () => {
  assert.equal(effectiveWitnesses(3, 1), 1);
});

test("partial overlap lands between the two", () => {
  assert.equal(effectiveWitnesses(3, 0.5), 1.5);
});

test("a panel where every model echoes counts as zero witnesses", () => {
  assert.equal(effectiveWitnesses(0, 0), 0);
});

test("the effective count can never exceed the nominal one", () => {
  // Kish's formula assumes k >= 1; below that the (k - 1) term flips sign and
  // the raw ratio grows with correlation. Half a witness reading one page must
  // not be reported as a whole independent witness.
  assert.equal(effectiveWitnesses(0.5, 1), 0.5);
  assert.equal(effectiveWitnesses(0.5, 0.8), 0.5);
  assert.equal(effectiveWitnesses(0.5, 0), 0.5);
});

test("a panel of one echo and one partial witness on shared evidence is not a whole witness", () => {
  const shared = ["Cochrane systematic reviews of vitamin C trials"];
  const probes = probesFrom([
    { model: "model-a", direct: "SUPPORTED", mirror: "SUPPORTED", anchors: shared },
    { model: "model-b", direct: "SUPPORTED", mirror: "UNCERTAIN", anchors: shared },
  ]);
  const consensus = computeConsensus(assessWitnesses(["model-a", "model-b"], probes));
  assert.equal(consensus.nominalAgree, 2);
  assert.ok(
    consensus.effectiveWitnesses <= 0.5,
    `expected at most the 0.5 of surviving vote weight, got ${consensus.effectiveWitnesses}`,
  );
  assert.ok(consensus.lostToRedundancy >= 0, "witness loss must never be reported as negative");
  assert.ok(consensus.lostToEcho >= 0, "witness loss must never be reported as negative");
});

// --- witness assessment ----------------------------------------------------

test("a model that affirms a claim and its negation is marked an echo and loses its vote", () => {
  const witnesses = assessWitnesses(
    ["model-a"],
    probesFrom([{ model: "model-a", direct: "SUPPORTED", mirror: "SUPPORTED", anchors: ["x"] }]),
  );
  assert.equal(witnesses[0].discriminationVerdict, "echo");
  assert.equal(witnesses[0].discrimination, 0);
});

test("a model that refutes the negation of what it supported is coherent", () => {
  const witnesses = assessWitnesses(
    ["model-a"],
    probesFrom([{ model: "model-a", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["x"] }]),
  );
  assert.equal(witnesses[0].discriminationVerdict, "coherent");
  assert.equal(witnesses[0].discrimination, 1);
});

test("a model whose mirror probe never returned is not counted as a witness", () => {
  const probes = probesFrom([{ model: "model-a", direct: "SUPPORTED", anchors: ["x"] }]);
  const witnesses = assessWitnesses(["model-a"], probes);
  assert.equal(witnesses[0].discriminationVerdict, "unavailable");
  assert.equal(witnesses[0].discrimination, 0);
});

test("an unreachable model is reported, not dropped", () => {
  const witnesses = assessWitnesses(MODELS, probesFrom([{ model: "model-a", direct: "SUPPORTED", mirror: "REFUTED" }]));
  assert.equal(witnesses.length, 3);
  assert.equal(witnesses[1].reachable, false);
  assert.match(witnesses[1].note, /one witness short/);
});

// --- the headline behaviour of the whole system ---------------------------

test("unanimous agreement on shared evidence collapses to roughly one witness", () => {
  const shared = ["Reuters report of 12 March 2024 on the vote"];
  const probes = probesFrom([
    { model: "model-a", direct: "SUPPORTED", mirror: "REFUTED", anchors: shared },
    { model: "model-b", direct: "SUPPORTED", mirror: "REFUTED", anchors: shared },
    { model: "model-c", direct: "SUPPORTED", mirror: "REFUTED", anchors: shared },
  ]);
  const consensus = computeConsensus(assessWitnesses(MODELS, probes));
  assert.equal(consensus.nominalAgree, 3);
  assert.equal(consensus.effectiveWitnesses, 1);
});

test("unanimous agreement on distinct evidence keeps all three witnesses", () => {
  const probes = probesFrom([
    { model: "model-a", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Reuters wire, 12 March 2024"] },
    { model: "model-b", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Hansard parliamentary transcript"] },
    { model: "model-c", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Eurostat quarterly release"] },
  ]);
  const consensus = computeConsensus(assessWitnesses(MODELS, probes));
  assert.equal(consensus.effectiveWitnesses, 3);
});

test("unanimous agreement from models that all echo scores NO SIGNAL, not certainty", () => {
  const probes = probesFrom([
    { model: "model-a", direct: "SUPPORTED", mirror: "SUPPORTED", anchors: ["a"] },
    { model: "model-b", direct: "SUPPORTED", mirror: "SUPPORTED", anchors: ["b"] },
    { model: "model-c", direct: "SUPPORTED", mirror: "SUPPORTED", anchors: ["c"] },
  ]);
  const witnesses = assessWitnesses(MODELS, probes);
  const consensus = computeConsensus(witnesses);
  const verdict = computeVerdict(witnesses, consensus);
  assert.equal(consensus.nominalAgree, 3, "the naive reading is still 3/3");
  assert.equal(consensus.effectiveWitnesses, 0);
  assert.equal(verdict.truthScore, 50);
  assert.equal(verdict.label, "NO SIGNAL");
});

test("no verdict ever reaches certainty, however unanimous the panel", () => {
  const probes = probesFrom([
    { model: "model-a", direct: "SUPPORTED", confidence: 1, mirror: "REFUTED", anchors: ["Reuters wire, 12 March 2024"] },
    { model: "model-b", direct: "SUPPORTED", confidence: 1, mirror: "REFUTED", anchors: ["Hansard transcript"] },
    { model: "model-c", direct: "SUPPORTED", confidence: 1, mirror: "REFUTED", anchors: ["Eurostat release"] },
  ]);
  const witnesses = assessWitnesses(MODELS, probes);
  const verdict = computeVerdict(witnesses, computeConsensus(witnesses));
  assert.ok(verdict.truthScore < 90, `expected < 90, got ${verdict.truthScore}`);
  assert.equal(verdict.truthScore, 88);
  assert.equal(verdict.label, "SUPPORTED");
});

test("a refuting panel scores low rather than merely unconfident", () => {
  const probes = probesFrom([
    { model: "model-a", direct: "REFUTED", mirror: "SUPPORTED", anchors: ["Reuters wire, 12 March 2024"] },
    { model: "model-b", direct: "REFUTED", mirror: "SUPPORTED", anchors: ["Hansard transcript"] },
    { model: "model-c", direct: "REFUTED", mirror: "SUPPORTED", anchors: ["Eurostat release"] },
  ]);
  const witnesses = assessWitnesses(MODELS, probes);
  const verdict = computeVerdict(witnesses, computeConsensus(witnesses));
  assert.ok(verdict.truthScore < 25, `expected < 25, got ${verdict.truthScore}`);
  assert.equal(verdict.label, "REFUTED");
});

test("a split panel is reported as contested and pulled toward unresolved", () => {
  const probes = probesFrom([
    { model: "model-a", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Reuters wire"] },
    { model: "model-b", direct: "REFUTED", mirror: "SUPPORTED", anchors: ["Hansard transcript"] },
    { model: "model-c", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Eurostat release"] },
  ]);
  const witnesses = assessWitnesses(MODELS, probes);
  const consensus = computeConsensus(witnesses);
  const verdict = computeVerdict(witnesses, consensus);
  assert.equal(consensus.contested, true);
  assert.deepEqual(consensus.dissenters, ["model-b"]);
  assert.ok(
    verdict.truthScore > 50 && verdict.truthScore < 70,
    `a 2-1 split should be a weak lean, got ${verdict.truthScore}`,
  );
  assert.match(verdict.headline, /split/i);
});

test("an echoing model cannot decide which side is the majority", () => {
  // model-a and model-b echo (no information); model-c is the only coherent
  // witness. The majority must follow the witness that actually discriminates.
  const probes = probesFrom([
    { model: "model-a", direct: "SUPPORTED", mirror: "SUPPORTED", anchors: ["a"] },
    { model: "model-b", direct: "SUPPORTED", mirror: "SUPPORTED", anchors: ["b"] },
    { model: "model-c", direct: "REFUTED", mirror: "SUPPORTED", anchors: ["Hansard transcript"] },
  ]);
  const consensus = computeConsensus(assessWitnesses(MODELS, probes));
  assert.equal(consensus.majorityStance, "REFUTED");
  assert.equal(consensus.effectiveWitnesses, 1);
});

test("the uncertainty band widens as independent witnesses disappear", () => {
  const strong = probesFrom([
    { model: "model-a", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Reuters wire"] },
    { model: "model-b", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Hansard transcript"] },
    { model: "model-c", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Eurostat release"] },
  ]);
  const weak = probesFrom([
    { model: "model-a", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Reuters wire"] },
  ]);
  const strongWitnesses = assessWitnesses(MODELS, strong);
  const weakWitnesses = assessWitnesses(MODELS, weak);
  const strongVerdict = computeVerdict(strongWitnesses, computeConsensus(strongWitnesses));
  const weakVerdict = computeVerdict(weakWitnesses, computeConsensus(weakWitnesses));
  assert.ok(
    weakVerdict.band > strongVerdict.band,
    `one witness (${weakVerdict.band}) should be less certain than three (${strongVerdict.band})`,
  );
});

// --- the unmeasurable case -------------------------------------------------

test("a model that names no sources is assumed dependent, not assumed independent", () => {
  // The convenient answer here is zero overlap, and it is the dangerous one: it
  // would score a panel that refuses to cite anything as maximally independent.
  const { value, measured } = pairOverlap([], ["Hansard transcript"]);
  assert.equal(measured, false);
  assert.equal(value, ASSUMED_OVERLAP);
});

test("silence about sources cannot inflate the effective witness count", () => {
  const probes = probesFrom([
    { model: "model-a", direct: "SUPPORTED", mirror: "REFUTED", anchors: [] },
    { model: "model-b", direct: "SUPPORTED", mirror: "REFUTED", anchors: [] },
    { model: "model-c", direct: "SUPPORTED", mirror: "REFUTED", anchors: [] },
  ]);
  const consensus = computeConsensus(assessWitnesses(MODELS, probes));
  assert.equal(consensus.nominalAgree, 3);
  assert.equal(consensus.overlapMeasured, false);
  // With the documented prior, three agreeing models that will not name a source
  // are worth 3 / (1 + 2 * 0.44) = 1.6 — well short of the three the naive
  // reading would report, and never the full panel.
  assert.equal(consensus.effectiveWitnesses, 1.6);
});

test("the report says when an overlap was assumed rather than measured", () => {
  const probes = probesFrom([
    { model: "model-a", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Reuters wire, 12 March 2024"] },
    { model: "model-b", direct: "SUPPORTED", mirror: "REFUTED", anchors: [] },
    { model: "model-c", direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Eurostat release"] },
  ]);
  const witnesses = assessWitnesses(MODELS, probes);
  const consensus = computeConsensus(witnesses);
  const verdict = computeVerdict(witnesses, consensus);
  assert.equal(consensus.overlapMeasured, false);
  assert.match(verdict.headline, /assumed rather than measured/);
});
