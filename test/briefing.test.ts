/**
 * What the adjudicating model is told.
 *
 * The adjudicator's prose is rendered to the reader under "What this rests on",
 * so a number it is handed carelessly becomes a claim the user sees. Two ways
 * that goes wrong, both of which happened and are pinned here:
 *
 *   - an overlap filled in from the documented prior is not an observation, and
 *     must never be briefed as one;
 *   - a witness whose overlap was never computed carries 0, which reads as
 *     "no overlap" — the opposite of the truth.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { independenceSummary, panelSummary } from "../lib/verify.ts";
import { assessWitnesses, computeConsensus } from "../lib/score.ts";
import { PANEL } from "../lib/models.ts";
import type { ProbeResult, Stance } from "../lib/types.ts";

const IDS = PANEL.map((m) => m.id);

interface Spec {
  model: string;
  direct?: Stance;
  mirror?: Stance;
  anchors?: string[];
}

function probesFrom(specs: Spec[]): ProbeResult[] {
  const out: ProbeResult[] = [];
  let i = 0;
  for (const s of specs) {
    out.push({ kind: "direct", modelId: s.model, status: "ok", stance: s.direct, confidence: 0.9, reasoning: "because", receiptIndex: i++ });
    if (s.mirror) {
      out.push({ kind: "mirror", modelId: s.model, status: "ok", stance: s.mirror, confidence: 0.9, reasoning: "because", receiptIndex: i++ });
    }
    out.push({ kind: "anchor", modelId: s.model, status: "ok", anchors: s.anchors ?? [], receiptIndex: i++ });
  }
  return out;
}

function brief(specs: Spec[]): string {
  const witnesses = assessWitnesses(IDS, probesFrom(specs));
  return independenceSummary(witnesses, computeConsensus(witnesses));
}

test("an assumed overlap is briefed as an assumption, never as a measurement", () => {
  const summary = brief([
    { model: IDS[0], direct: "SUPPORTED", mirror: "REFUTED", anchors: [] },
    { model: IDS[1], direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Eurostat quarterly releases"] },
    { model: IDS[2], direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Hansard transcripts"] },
  ]);
  assert.match(summary, /assumed default/i);
  assert.match(summary, /never as an observation/i);
  assert.doesNotMatch(
    summary,
    /Mean measured evidence overlap/,
    "an unmeasurable panel must not be described as measured",
  );
});

test("a measured overlap is briefed as measured", () => {
  const shared = ["Cochrane systematic reviews of vitamin C trials"];
  const summary = brief([
    { model: IDS[0], direct: "SUPPORTED", mirror: "REFUTED", anchors: shared },
    { model: IDS[1], direct: "SUPPORTED", mirror: "REFUTED", anchors: shared },
    { model: IDS[2], direct: "SUPPORTED", mirror: "REFUTED", anchors: shared },
  ]);
  assert.match(summary, /Mean measured evidence overlap inside that agreeing group: 100%/);
  assert.doesNotMatch(summary, /assumed default/i);
});

test("a witness whose overlap was never computed is not briefed as having none", () => {
  // model 3 dissents, so it sits outside the agreeing group and its
  // sharedAnchorRatio is never filled in. Reporting that as "0% overlap" would
  // tell the adjudicator the opposite of what was measured.
  const summary = brief([
    { model: IDS[0], direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Eurostat quarterly releases"] },
    { model: IDS[1], direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Hansard transcripts"] },
    { model: IDS[2], direct: "REFUTED", mirror: "SUPPORTED", anchors: ["Reuters wire reports"] },
  ]);
  assert.match(summary, /does not sit inside the agreeing group/i);
});

test("a model that echoed is briefed as carrying no information", () => {
  const summary = brief([
    { model: IDS[0], direct: "SUPPORTED", mirror: "SUPPORTED", anchors: ["Eurostat quarterly releases"] },
    { model: IDS[1], direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Hansard transcripts"] },
    { model: IDS[2], direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Reuters wire reports"] },
  ]);
  assert.match(summary, /same answer \(SUPPORTED\) to the claim AND to its negation/);
  assert.match(summary, /carries no information/);
});

test("the panel briefing says plainly when a model did not answer", () => {
  const witnesses = assessWitnesses(
    IDS,
    probesFrom([{ model: IDS[0], direct: "SUPPORTED", mirror: "REFUTED", anchors: ["Hansard transcripts"] }]),
  );
  const summary = panelSummary(witnesses, probesFrom([{ model: IDS[0], direct: "SUPPORTED", mirror: "REFUTED" }]));
  assert.match(summary, /did not answer/);
});
