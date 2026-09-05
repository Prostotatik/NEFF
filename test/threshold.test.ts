/**
 * The anchor match threshold is the only judgement call in `lib/score.ts`, and a
 * judgement call in a scoring function is exactly where a project quietly tunes
 * itself a better demo. These tests pin the two things that make 0.6 defensible.
 *
 * The anchor strings below are verbatim model output from real runs in `.runs/`,
 * not invented examples.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ANCHOR_MATCH_THRESHOLD, anchorOverlap, effectiveWitnesses } from "../lib/score.ts";

/** Two descriptions of one archive, from DeepSeek and MiniMax on the same claim. */
const ZANZIBAR_A = [
  "British Admiralty and Colonial Office records of the 1896 Zanzibar expedition",
  "Royal Navy ship logs and contemporary dispatches from Zanzibar",
  "Academic historical scholarship on the Anglo-Zanzibar War and British imperial policy",
];
const ZANZIBAR_B = [
  "British Admiralty and Foreign Office records from 1896 (The National Archives, Kew)",
  "Contemporary British newspaper accounts from August 1896",
  "historical accounts of the Anglo-Zanzibar War in academic histories of the British Empire",
];

/** Three models on vitamin C, all naming the Cochrane review literature. */
const VITAMIN_A = [
  "Cochrane systematic reviews of vitamin C for preventing and treating the common cold",
  "Randomised controlled trials of vitamin C supplementation in community populations",
  "Meta-analyses of vitamin C trials in the Cochrane Database of Systematic Reviews",
];
const VITAMIN_B = [
  "Cochrane systematic reviews of randomized controlled trials of vitamin C supplementation for preventing the common cold",
  "Randomized placebo-controlled trials of vitamin C supplementation in general adult populations",
  "Randomized placebo-controlled trials of vitamin C supplementation in specific populations (athletes, children, elderly)",
];

test("the threshold in use is the one the code documents", () => {
  assert.equal(ANCHOR_MATCH_THRESHOLD, 0.6);
});

test("a looser threshold never reports less overlap than a stricter one", () => {
  // Containment is monotone in the threshold, so the direction of the knob is
  // unambiguous: loosening it can only ever find more echoes, never fewer.
  for (const [a, b] of [
    [ZANZIBAR_A, ZANZIBAR_B],
    [VITAMIN_A, VITAMIN_B],
  ]) {
    let previous = 1.1;
    for (const threshold of [0.4, 0.5, 0.6, 0.7, 0.8]) {
      const overlap = anchorOverlap(a, b, threshold);
      assert.ok(
        overlap <= previous + 1e-9,
        `overlap rose from ${previous} to ${overlap} when the threshold rose to ${threshold}`,
      );
      previous = overlap;
    }
  }
});

test("0.6 is not the value that would flatter this project's own thesis", () => {
  // Quorum's argument is that agreeing models are worth fewer witnesses than
  // they look. A lower threshold finds more shared evidence, which raises rho,
  // which lowers the Effective Witness Count — a more striking demo every time.
  // If 0.6 had been chosen for effect it would be at the bottom of this range,
  // not above the middle of it.
  const k = 2;
  const strict = effectiveWitnesses(k, anchorOverlap(ZANZIBAR_A, ZANZIBAR_B, 0.6));
  const loose = effectiveWitnesses(k, anchorOverlap(ZANZIBAR_A, ZANZIBAR_B, 0.4));
  assert.ok(
    strict >= loose,
    `the chosen threshold reports ${strict} witnesses where a looser one reports ${loose}; ` +
      "0.6 is supposed to be the conservative choice, not the flattering one",
  );
});

test("obviously identical evidence is still caught at the chosen threshold", () => {
  // The threshold errs toward missing matches, but it must not be so strict that
  // three models reading the Cochrane vitamin C literature look independent —
  // that is the failure this whole measurement exists to prevent.
  assert.ok(
    anchorOverlap(VITAMIN_A, VITAMIN_B) >= 0.6,
    "the vitamin C anchor sets are the same literature and must register as overlapping",
  );
});

test("unrelated evidence bases do not register as shared", () => {
  const overlap = anchorOverlap(ZANZIBAR_A, VITAMIN_A);
  assert.equal(overlap, 0, `unrelated anchors scored ${overlap}`);
});
