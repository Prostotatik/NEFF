import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normaliseConfidence,
  normaliseStance,
  parseJsonObject,
  stringList,
  stripThinking,
} from "../lib/parse.ts";

// Every input below was observed coming back from a model on the Gonka panel.

test("a think block before the answer is stripped", () => {
  const raw = `<think>The user wants me to assess this. Let me consider...</think>\n{"stance":"REFUTED","confidence":0.8}`;
  const parsed = parseJsonObject<{ stance: string }>(raw);
  assert.equal(parsed?.stance, "REFUTED");
});

test("an unterminated think block does not swallow the whole response", () => {
  assert.equal(stripThinking("<think>reasoning that never closes"), "");
});

test("JSON inside a markdown fence is parsed", () => {
  const parsed = parseJsonObject<{ stance: string }>('```json\n{"stance":"SUPPORTED"}\n```');
  assert.equal(parsed?.stance, "SUPPORTED");
});

test("prose before and after the object does not defeat the parser", () => {
  const raw = 'Here is my assessment:\n{"stance":"UNCERTAIN"}\nLet me know if you need more.';
  assert.equal(parseJsonObject<{ stance: string }>(raw)?.stance, "UNCERTAIN");
});

test("braces inside a string literal do not truncate the object", () => {
  const raw = '{"reasoning":"the report uses {curly} notation","stance":"SUPPORTED"}';
  assert.equal(parseJsonObject<{ stance: string }>(raw)?.stance, "SUPPORTED");
});

test("an escaped quote inside a string does not truncate the object", () => {
  const raw = '{"reasoning":"the source says \\"no effect\\" plainly","stance":"REFUTED"}';
  assert.equal(parseJsonObject<{ stance: string }>(raw)?.stance, "REFUTED");
});

test("a truncated response returns null rather than a plausible-looking object", () => {
  // This is the load-bearing case: a fabricated fallback verdict presented as a
  // model result would be the most dishonest thing the app could do.
  assert.equal(parseJsonObject('{"stance":"SUPPORTED","reasoning":"the evid'), null);
});

test("a response with no JSON at all returns null", () => {
  assert.equal(parseJsonObject("I cannot assess this claim."), null);
});

test("an array is not accepted where an object is required", () => {
  assert.equal(parseJsonObject('["SUPPORTED"]'), null);
});

test("stance synonyms are normalised, and unknown words are rejected", () => {
  assert.equal(normaliseStance("true"), "SUPPORTED");
  assert.equal(normaliseStance("Contradicted"), "REFUTED");
  assert.equal(normaliseStance("unverifiable"), "UNCERTAIN");
  assert.equal(normaliseStance("mostly yes"), null);
  assert.equal(normaliseStance(0.9), null);
});

test("confidence given as a percentage is rescaled, and nonsense is rejected", () => {
  assert.equal(normaliseConfidence(85), 0.85);
  assert.equal(normaliseConfidence(0.85), 0.85);
  assert.equal(normaliseConfidence("0.7"), 0.7);
  assert.equal(normaliseConfidence(-1), null);
  assert.equal(normaliseConfidence(1000), null);
  assert.equal(normaliseConfidence("very high"), null);
});

test("anchor lists are deduplicated, trimmed and bounded", () => {
  const out = stringList([" Cochrane reviews ", "cochrane reviews", "", 42, "Eurostat"], 3);
  assert.deepEqual(out, ["Cochrane reviews", "Eurostat"]);
});
