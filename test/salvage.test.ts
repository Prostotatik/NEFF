/**
 * Recovering an answer the model wrote and then never repeated.
 *
 * Measured on the Gonka panel: MiniMax-M2.7 drafts the JSON object it is about
 * to return *inside* its `<think>` block, then closes the block and writes it
 * out again. In 5 of 62 captured responses the draft is there verbatim. When the
 * node's token ceiling lands mid-thought, the block never closes, the second
 * copy is never written, and everything the model found is discarded — even
 * though it had already written the answer out in full one paragraph earlier.
 *
 * The prose below is verbatim from a captured response
 * (`MiniMaxAI/MiniMax-M2.7`, anchor probe, vitamin C claim), trimmed to the part
 * that matters and cut off where a token ceiling would cut it.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { extractThinking, parseAnswer, parseJsonObject, stringList } from "../lib/parse.ts";

/** A response whose think block never closed: the answer exists only as a draft. */
const TRUNCATED_ANCHOR = `<think>The user is asking me to identify the body of evidence that would be used to assess the claim "Taking vitamin C supplements prevents the common cold."

The note should explain what this evidence would need to show: that randomized trials demonstrate a statistically significant reduction in cold incidence or severity with vitamin C supplementation compared to placebo.

Let me structure this properly:

\`\`\`json
{
  "anchors": [
    "Cochrane systematic reviews of randomized controlled trials of vitamin C supplementation for preventing the common cold",
    "Randomized placebo-controlled trials of vitamin C supplementation in general populations",
    "Randomized placebo-controlled trials of vitamin C supplementation in specific populations (athletes, children, elderly)"
  ],
  "note": "The claim would be supported if systematic reviews of randomized trials consistently show that vitamin C supplementation significantly reduces the incidence, duration, or severity of the common cold compared to placebo."
}
\`\`\`

Wait, I need to be careful here. The user says I must not invent citations. I shou`;

/** The same response, finished properly. The draft and the answer both exist. */
const COMPLETE_ANCHOR = `${TRUNCATED_ANCHOR.slice(0, TRUNCATED_ANCHOR.indexOf("Wait, I need"))}
</think>
{"anchors": ["Cochrane systematic reviews of vitamin C for preventing and treating the common cold"], "note": "It would have to show a reduction in incidence."}`;

test("the old parser drops a truncated response entirely", () => {
  // This is the behaviour being fixed, pinned so the fix cannot silently be
  // reverted: stripThinking leaves nothing, so there is no object to find.
  assert.equal(parseJsonObject(TRUNCATED_ANCHOR), null);
});

test("the model's own draft is recovered when its answer never arrived", () => {
  const parsed = parseAnswer<{ anchors: unknown }>(TRUNCATED_ANCHOR, "anchors");
  assert.ok(parsed, "nothing was recovered from a response that contains the answer verbatim");
  assert.equal(parsed.origin, "draft");
  const anchors = stringList(parsed.value.anchors, 3);
  assert.equal(anchors.length, 3);
  assert.match(anchors[0], /Cochrane systematic reviews/);
});

test("a complete answer is used as the answer, never as a draft", () => {
  const parsed = parseAnswer<{ anchors: unknown }>(COMPLETE_ANCHOR, "anchors");
  assert.ok(parsed);
  assert.equal(parsed.origin, "answer");
  // The response after the think block is one anchor; the draft inside it was
  // three. Taking the draft here would report evidence the model chose not to
  // stand behind.
  assert.equal(stringList(parsed.value.anchors, 3).length, 1);
});

test("recovery requires the field this probe asked for", () => {
  // A stance probe must not be answered out of an anchor draft, and vice versa.
  assert.equal(parseAnswer(TRUNCATED_ANCHOR, "stance"), null);
});

test("nothing is recovered from reasoning that never drafted an answer", () => {
  const prose = `<think>I am fairly sure the Berlin Wall came down in November 1989, and I
  would lean SUPPORTED with high confidence, but let me think about the exact date`;
  assert.equal(parseAnswer(prose, "stance"), null);
});

test("a truncated draft is not treated as a draft", () => {
  const cut = TRUNCATED_ANCHOR.slice(0, TRUNCATED_ANCHOR.indexOf("in general populations"));
  assert.equal(parseAnswer(cut, "anchors"), null);
});

test("the chain of thought is kept whether or not the block closed", () => {
  assert.match(extractThinking(TRUNCATED_ANCHOR), /Let me structure this properly/);
  assert.match(extractThinking(COMPLETE_ANCHOR), /Let me structure this properly/);
  // And the tags themselves never reach the reader.
  assert.doesNotMatch(extractThinking(COMPLETE_ANCHOR), /<\/?think>/);
});

test("a response with no thinking at all yields no working", () => {
  assert.equal(extractThinking('{"stance":"SUPPORTED","confidence":0.9}'), "");
});
