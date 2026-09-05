/**
 * The retry policy, driven through the real client against a local server.
 *
 * Three failures get three different retries, and each of them can go wrong in a
 * way no unit test of a pure function would catch: a timeout must be retried
 * without waiting, a rate limit must wait long enough to be outside the window,
 * and none of them may overrun the phase budget the caller set. That last one is
 * the whole reason `deadline` exists, and it was broken on first writing — the
 * backoff slept past the deadline and only then discovered there was no time
 * left, overrunning the phase by up to the length of the wait.
 */

import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";

type Behaviour = "429" | "429-with-retry-after" | "429-long-retry-after" | "ok" | "stall";

let server: Server;
let baseUrl = "";
let behaviour: Behaviour = "429";
let hits: number[] = [];

before(async () => {
  server = createServer((req, res) => {
    hits.push(Date.now());
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (behaviour === "stall") return; // never answers; the client's clock decides
      if (behaviour === "ok") {
        res.writeHead(200, { "Content-Type": "application/json", "x-request-id": "req-ok" });
        res.end(
          JSON.stringify({
            id: "devshard-ok",
            choices: [{ finish_reason: "stop", message: { content: '{"stance":"SUPPORTED"}' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
        return;
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (behaviour === "429-with-retry-after") headers["retry-after"] = "2";
      if (behaviour === "429-long-retry-after") headers["retry-after"] = "8";
      res.writeHead(429, headers);
      res.end(JSON.stringify({ error: { message: "rate limited" } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/v1`;
  process.env.GONKA_BASE_URL = baseUrl;
  process.env.GONKA_API_KEY = "sk-test-not-a-real-key-000000000000";
});

after(() => server.close());

async function client() {
  const { gonkaChat, GonkaError } = await import("../lib/gonka.ts");
  return { gonkaChat, GonkaError };
}

const messages = [{ role: "user" as const, content: "hello" }];

test("a rate limit waits far longer than a blip would", async () => {
  behaviour = "429";
  hits = [];
  const { gonkaChat } = await client();
  const started = Date.now();
  await assert.rejects(
    gonkaChat({ model: "m", messages, purpose: "test", maxAttempts: 2, deadline: Date.now() + 30_000 }),
  );
  assert.equal(hits.length, 2, "the rate-limited call was not retried exactly once");
  const gap = hits[1] - hits[0];
  // The old base was 700ms, which put every retry inside the same window. The
  // floor here is well above that and well below the 2.5s + jitter it now uses.
  assert.ok(gap > 1_500, `retried after only ${gap}ms; a rate limit is a window, not a blip`);
  assert.ok(Date.now() - started < 20_000, "the retry took absurdly long");
});

test("the gateway's own Retry-After is honoured", async () => {
  behaviour = "429-with-retry-after";
  hits = [];
  const { gonkaChat } = await client();
  await assert.rejects(
    gonkaChat({ model: "m", messages, purpose: "test", maxAttempts: 2, deadline: Date.now() + 30_000 }),
  );
  assert.equal(hits.length, 2);
  const gap = hits[1] - hits[0];
  // Retry-After: 2 — so about two seconds plus jitter, and notably *less* than
  // the 2.5s default it would otherwise have chosen.
  assert.ok(gap >= 1_900, `waited only ${gap}ms against a Retry-After of 2s`);
  assert.ok(gap < 3_400, `waited ${gap}ms; the gateway asked for 2s, not longer`);
});

test("a backoff never sleeps past the deadline it was given", async () => {
  // The gateway asks for eight seconds and the phase has five left. Without the
  // guard the client sleeps the full eight, wakes, finds no time left and gives
  // up anyway — having overrun the phase by more than three seconds for nothing.
  // Removing the guard makes this test fail on the elapsed time, which is how it
  // was checked to have teeth.
  behaviour = "429-long-retry-after";
  hits = [];
  const { gonkaChat } = await client();
  const deadline = Date.now() + 5_000;
  const started = Date.now();
  await assert.rejects(
    gonkaChat({ model: "m", messages, purpose: "test", maxAttempts: 3, deadline }),
  );
  const elapsed = Date.now() - started;
  assert.equal(hits.length, 1, `made ${hits.length} sends inside a budget that fits one`);
  assert.ok(
    elapsed < 2_000,
    `took ${elapsed}ms to give up on a retry it could never have made in time`,
  );
  assert.ok(Date.now() < deadline, "the call returned after its own deadline");
});

test("the same call does retry when the budget has room for it", async () => {
  // The companion to the test above: proof that the guard is refusing a retry
  // for lack of time, not refusing retries in general.
  behaviour = "429";
  hits = [];
  const { gonkaChat } = await client();
  await assert.rejects(
    gonkaChat({ model: "m", messages, purpose: "test", maxAttempts: 3, deadline: Date.now() + 30_000 }),
  );
  assert.equal(hits.length, 3, `made ${hits.length} sends where three were budgeted`);
});

test("a timeout is retried, and retried immediately", async () => {
  behaviour = "stall";
  hits = [];
  const { gonkaChat } = await client();
  await assert.rejects(
    gonkaChat({
      model: "m",
      messages,
      purpose: "test",
      maxAttempts: 2,
      timeoutMs: 1_200,
      firstAttemptMs: 1_200,
      deadline: Date.now() + 20_000,
    }),
    /Timed out/,
  );
  assert.equal(hits.length, 2, "a timed-out call was not retried");
  const gap = hits[1] - hits[0];
  // The router is already holding a finished completion for that exact body, so
  // waiting before asking again spends budget for nothing.
  assert.ok(gap < 1_800, `waited ${gap}ms before re-sending a timed-out call`);
});

test("a caller that has gone away is never retried", async () => {
  behaviour = "stall";
  hits = [];
  const { gonkaChat } = await client();
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 400);
  await assert.rejects(
    gonkaChat({
      model: "m",
      messages,
      purpose: "test",
      maxAttempts: 3,
      timeoutMs: 5_000,
      deadline: Date.now() + 20_000,
      signal: controller.signal,
    }),
    /Cancelled/,
  );
  assert.equal(hits.length, 1, "an abandoned call kept spending inference");
});
