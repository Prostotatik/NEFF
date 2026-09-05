/**
 * Does the draft-recovery branch actually work against the real router?
 *
 * `test/salvage.test.ts` proves the parser recovers a captured response. That is
 * not the same claim as "the pipeline recovers a live one": the branch sits in
 * `runProbe`'s catch, behind `gonkaChat`'s retry ladder, and a branch nobody has
 * ever run is not a fix.
 *
 * The failure it handles — MiniMax spending its whole token budget inside
 * `<think>` — is rare at the production budget, but it can be summoned by
 * starving the probe. These drive the real `runProbe` against the real Gonka
 * Router with the budget turned down far enough that the ceiling lands
 * mid-thought; everything else on the path is what a verification runs.
 *
 * What is *not* checked here is whether the salvage then finds a draft, because
 * that depends on how far into its thinking the model had got before the
 * ceiling. `test/recovery.test.ts` pins that half deterministically, against a
 * captured response, through the same code.
 *
 * Skipped rather than failed when the router will not cooperate: a node that
 * happens to answer inside a tiny budget, or a gateway having a bad minute, is
 * not this code being wrong.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { PANEL } from "../../lib/models.ts";
import { runProbe } from "../../lib/verify.ts";

const MINIMAX = PANEL.find((m) => m.id === "MiniMaxAI/MiniMax-M2.7")!;

/**
 * Small enough that the chain of thought cannot finish. Measured: a complete
 * MiniMax anchor response on this claim costs 600–780 completion tokens, so 400
 * lands the ceiling reliably inside the block. It must not be set near that
 * range or the node simply answers and there is no failure to respond to — 900
 * was tried first and did exactly that.
 */
const STARVED_TOKENS = 400;

test("a node that runs out of tokens is asked again with more of them", async (t) => {
  // Starving the probe makes the router produce, on demand, the one failure
  // that is otherwise a matter of the model's mood: a completion that ends
  // inside its own chain of thought. What is being checked is the response to
  // it — the budget is raised and the call is made again, rather than the probe
  // being written off. (Whether the *recovery* branch then fires depends on how
  // far into its thinking the model had got, so that half is pinned
  // deterministically in `test/recovery.test.ts` against a captured response.)
  const starved = { ...MINIMAX, maxTokens: STARVED_TOKENS, firstAttemptMs: 40_000 };

  const { probe, receipt } = await runProbe(
    "anchor",
    starved,
    "Taking vitamin C supplements prevents the common cold.",
    "Taking vitamin C supplements does not prevent the common cold.",
    Date.now() + 90_000,
  );

  if (receipt.attempts === 1 && receipt.finishReason === "stop") {
    t.skip(`the node finished inside ${STARVED_TOKENS} tokens on the first send`);
    return;
  }
  if (!receipt.rawResponse && receipt.status === "error") {
    t.skip(`the router returned no text at all: ${probe.error ?? receipt.error ?? "unknown"}`);
    return;
  }

  assert.ok(
    receipt.attempts > 1,
    `a truncated completion was not retried (finish_reason ${receipt.finishReason})`,
  );
  assert.ok(
    receipt.request.max_tokens > STARVED_TOKENS,
    `the retry did not raise the token budget: still ${receipt.request.max_tokens}`,
  );
  // However it ended, the node's own words are never thrown away.
  if (receipt.rawResponse) {
    assert.ok(
      probe.thinking || probe.anchors?.length,
      "a starved probe came back with neither an answer nor the reasoning behind it",
    );
  }
  if (probe.recovered) {
    for (const anchor of probe.anchors ?? []) {
      assert.ok(
        receipt.rawResponse.includes(anchor),
        `recovered anchor is not verbatim in what the node returned: ${anchor}`,
      );
    }
  }
});

test("a starved probe that cannot be recovered still keeps the node's reasoning", async (t) => {
  // Far too small to reach a draft: the model has barely started thinking. There
  // is nothing to recover, and the requirement is that the prose still survives
  // rather than being replaced by an error string.
  const starved = { ...MINIMAX, maxTokens: 120, firstAttemptMs: 40_000 };
  const { probe, receipt } = await runProbe(
    "direct",
    starved,
    "The Berlin Wall fell on 9 November 1989.",
    "The Berlin Wall did not fall on 9 November 1989.",
    Date.now() + 90_000,
  );

  if (!receipt.rawResponse) {
    t.skip(`the router returned no text at all: ${probe.error ?? receipt.error ?? "unknown"}`);
    return;
  }
  assert.ok(
    probe.thinking && probe.thinking.length > 0,
    "a probe that failed to parse threw the node's reasoning away",
  );
  assert.ok(
    receipt.rawResponse.includes(probe.thinking!.slice(0, 60)),
    "the surfaced working is not what the node actually said",
  );
});
