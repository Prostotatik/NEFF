/**
 * The draft-recovery branch, driven end to end through the real client.
 *
 * `test/salvage.test.ts` proves the parser can read a draft out of a chain of
 * thought. This proves the pipeline does: the whole path runs — `runProbe`,
 * `gonkaChat`, its retry ladder, the receipt, the parse — with nothing stubbed
 * except where the bytes come from.
 *
 * They come from a local server replaying a **captured Gonka response**: a
 * MiniMax-M2.7 anchor probe that spent its entire token budget inside `<think>`
 * (`finish_reason: "length"`, `completion_tokens` equal to `max_tokens`
 * exactly). That shape cannot be summoned on demand from the live router — it
 * depends on the model's mood and on what the router has cached — which is
 * exactly why the branch that handles it needs a test that does not depend on
 * catching it in the wild.
 *
 * The response body below is the real one, trimmed to the part that matters.
 */

import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";

const TRUNCATED_CONTENT = `<think>The user is asking me to identify the body of evidence that would be used to assess the claim "Taking vitamin C supplements prevents the common cold."

Let me think about what evidence would be relevant here. The most authoritative source would be Cochrane systematic reviews, which have examined this question multiple times.

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

let server: Server;
let baseUrl = "";
let requestsSeen = 0;
let budgetsSeen: number[] = [];

before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requestsSeen += 1;
      try {
        budgetsSeen.push(JSON.parse(body).max_tokens);
      } catch {
        budgetsSeen.push(-1);
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        // The two headers the receipt ledger is built from, so the shape a real
        // response has is the shape this one has.
        "x-request-id": `req-replay-${requestsSeen}`,
        "x-devshard-id": "devshard-replay",
      });
      res.end(
        JSON.stringify({
          id: `devshard-replay-${requestsSeen}`,
          system_fingerprint: "vllm-replay",
          choices: [{ finish_reason: "length", message: { content: TRUNCATED_CONTENT } }],
          usage: { prompt_tokens: 440, completion_tokens: 3200, total_tokens: 3640 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/v1`;
});

after(() => server.close());

test("a probe whose answer never arrived is recovered from the model's own draft", async () => {
  requestsSeen = 0;
  budgetsSeen = [];
  // `lib/gonka.ts` reads both of these at module scope, so they have to be set
  // before the first import of it.
  process.env.GONKA_BASE_URL = baseUrl;
  process.env.GONKA_API_KEY = "sk-test-not-a-real-key-000000000000";

  const { PANEL } = await import("../lib/models.ts");
  const { runProbe } = await import("../lib/verify.ts");
  const minimax = PANEL.find((m) => m.id === "MiniMaxAI/MiniMax-M2.7")!;

  const { probe, receipt } = await runProbe(
    "anchor",
    { ...minimax, firstAttemptMs: 5_000, timeoutMs: 5_000 },
    "Taking vitamin C supplements prevents the common cold.",
    "Taking vitamin C supplements does not prevent the common cold.",
    Date.now() + 60_000,
  );

  // The node never produced an answer, and the probe is usable anyway.
  assert.equal(probe.status, "ok", `probe failed instead of recovering: ${probe.error}`);
  assert.equal(probe.recovered, true, "the answer was not marked as recovered");
  assert.equal((probe.anchors ?? []).length, 3);
  assert.match((probe.anchors ?? [])[0], /Cochrane systematic reviews/);

  // Every recovered anchor is the model's own text, verbatim. Nothing here may
  // be paraphrased, merged or inferred.
  for (const anchor of probe.anchors ?? []) {
    assert.ok(TRUNCATED_CONTENT.includes(anchor), `anchor is not verbatim: ${anchor}`);
  }

  // And the working survives alongside it, tags stripped.
  assert.match(probe.thinking ?? "", /Let me structure this properly/);
  assert.doesNotMatch(probe.thinking ?? "", /<\/?think>/);

  // The retry ladder ran before the salvage did: a truncated response is worth
  // asking again with a bigger budget, and only the last one is salvaged.
  assert.ok(requestsSeen > 1, `expected a truncation retry, saw ${requestsSeen} request(s)`);
  assert.ok(
    budgetsSeen[1] > budgetsSeen[0],
    `the retry did not raise the token budget: ${budgetsSeen.join(" -> ")}`,
  );
  assert.equal(receipt.finishReason, "length");
});
