/**
 * Live checks against the Gonka Router.
 *
 * These talk to the real gateway, because the things they verify — that the
 * request id really is in the response header, that a bad model degrades into a
 * receipt instead of an exception — are properties of the router, and a mock
 * would only assert what we already believe.
 *
 * Run with: npm run test:live   (not part of the default suite; needs GONKA_API_KEY)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { GonkaError, gonkaChat, gonkaModels, redact } from "../../lib/gonka.ts";
import { PANEL } from "../../lib/models.ts";

const configured = Boolean(process.env.GONKA_API_KEY);
const options = { skip: configured ? false : "GONKA_API_KEY is not set" };

test("the router lists at least the models the panel expects", options, async () => {
  const available = await gonkaModels();
  assert.ok(available.length >= 2, `expected 2+ models, got ${available.length}`);
  for (const model of PANEL) {
    assert.ok(available.includes(model.id), `panel model missing from the router: ${model.id}`);
  }
});

test("a completion returns a Gonka request id and the node that served it", options, async () => {
  const { text, receipt } = await gonkaChat({
    model: PANEL[0].id,
    messages: [{ role: "user", content: "Reply with exactly: OK" }],
    purpose: "selftest",
    maxTokens: 32,
    timeoutMs: 60_000,
  });

  assert.ok(text.length > 0, "expected a non-empty completion");
  assert.match(receipt.requestId, /^req-/, "request id must come from the x-request-id header");
  assert.ok(receipt.devshardId.length > 0, "the serving node id must be recorded");
  assert.equal(receipt.status, "ok");
  assert.ok(receipt.totalTokens > 0, "token usage must be recorded for the ledger");
});

test("an unreachable model degrades into a receipt, never an unhandled throw", options, async () => {
  // A lost node has to cost the panel a witness and be shown in the ledger. It
  // must never take the whole verification down.
  await assert.rejects(
    () =>
      gonkaChat({
        model: "this-model/does-not-exist",
        messages: [{ role: "user", content: "hello" }],
        purpose: "selftest",
        maxTokens: 16,
        timeoutMs: 30_000,
        maxAttempts: 1,
      }),
    (error: unknown) => {
      assert.ok(error instanceof GonkaError, "failures must arrive as GonkaError");
      assert.equal(error.receipt.status, "error");
      assert.ok(error.receipt.error, "the receipt must carry a human-readable reason");
      assert.equal(error.receipt.purpose, "selftest");
      return true;
    },
  );
});

test("nothing that looks like a key can survive redaction", () => {
  const leaked = "Authorization failed for sk-AbCdEf0123456789XyZzy while calling the router";
  assert.ok(!redact(leaked).includes("sk-AbCdEf0123456789XyZzy"));
  assert.match(redact(leaked), /sk-\*\*\*redacted\*\*\*/);
});
