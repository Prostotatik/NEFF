# Gonka Router integration

Everything a reviewer needs to confirm that all of Quorum's reasoning happens on the Gonka Network,
and how to reproduce any single step of a verdict.

## The rule this codebase enforces

> All AI reasoning and verification logic **MUST** run on the Gonka Network via the official
> inference gateway (`gonkarouter.io`).
> — *Hackathon Challenge: AI for Society*, §2

`lib/gonka.ts` is the only module in the repository that calls a model. There is no provider
abstraction, no fallback client, and no second SDK — adding one would make it possible for a later
edit to route inference elsewhere without anyone noticing, and the premise of this submission is that
the reasoning is verifiably decentralised.

Check it yourself:

```bash
# every outbound model call in the app
grep -rn "chat/completions" --include=*.ts .

# nothing else claims to be an inference provider
grep -rniE "openai|anthropic|gemini|mistral|ollama|together\.ai|groq" --include=*.ts --include=*.tsx .
```

## Configuration

```
GONKA_API_KEY=sk-...                        # server-side only, from .env, never in the bundle
GONKA_BASE_URL=https://api.gonkarouter.io/v1
```

`.env` is git-ignored and has never been committed. The key is read inside `lib/gonka.ts`, which
begins with `import "server-only"` — if any client component ever imported it, the build would fail
rather than shipping the key to a browser. `redact()` scrubs anything key-shaped out of error text
before it can reach a log line or an HTTP response.

`./init.sh --check` verifies connectivity against the live gateway before the app starts, and
`GET /api/health` reports which panel models the router currently lists — without echoing the key.

## The eleven calls in a verification

| # | Purpose | Model | What it does |
|---|---|---|---|
| 1 | `prep` | DeepSeek V4 Flash | reduces the input to one checkable claim and its faithful negation |
| 2–4 | `direct` | all three | assess the claim as stated |
| 5–7 | `mirror` | all three | assess the *negation*, presented blind as if it were the original claim |
| 8–10 | `anchor` | all three | name the body of evidence the assessment rests on |
| 11 | `adjudicate` | DeepSeek V4 Flash | the load-bearing fact, and what would flip the verdict |

Probes 2–10 are fired concurrently, gated at four in flight, and streamed to the browser as each node
answers.

## Capturing the Gonka Request ID

The brief asks for the request id to be displayed as proof the verdict was not produced by a central
server. **It is not in the response body** — it arrives as a response header:

```
x-request-id:   req-1788473643105856296-578027     <- the Gonka Request ID
x-devshard-id:  70853                              <- the node that actually served the inference
```

The body's `id` field is the completion id in the form `devshard-70853-397`, and
`system_fingerprint` reports the serving node's engine build (e.g. `vllm-0.25.1-7a1a2cb0`). Quorum
records all four, per call, and shows them in the receipt ledger. Because the node id is captured
too, the ledger shows *which* decentralised nodes served a verdict, not merely that a gateway was
called — a single verification typically spans several distinct devshards.

## Reproducing any step of a verdict

Open a report, expand any row of the receipt ledger, and copy the request body shown there. That is
the exact payload Quorum sent:

```bash
curl -X POST https://api.gonkarouter.io/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GONKA_API_KEY" \
  -d @the-request-body-from-the-ledger.json
```

Temperature is 0 on every call, so the step is as reproducible as the node makes it.

## Router behaviour this integration is built around

All measured against the live gateway, not assumed:

- **Bursts are rate limited.** Nine concurrent probes reliably drew HTTP 429 and Cloudflare 524.
  Calls are gated at four in flight and retried up to three times with exponential backoff and
  jitter. Retries are counted on the receipt, so the ledger stays honest about what a run cost.
- **Chain of thought is billed against `max_tokens`.** MiniMax M2.7 emits it inline in a
  `<think>` block; Kimi K2.6 returns it in a separate `reasoning` field. A budget sized for the
  answer alone makes either return nothing at all, with `finish_reason: "length"` and empty content.
  Both are given room, and the reasoning is recorded in the ledger.
- **Kimi K2.6 reasons at roughly 13 tokens/second** and spent about 2,000 tokens per probe, which put
  a verification past four minutes. It is called with `chat_template_kwargs: { thinking: false }`,
  which brings the same probe back in seconds. The switch is per-model configuration in
  `lib/models.ts`, not a hidden constant.
- **A dead node is not a dead verification.** Any call can fail; failures come back as a receipt with
  `status: "error"` and a readable reason, the run completes on the models that answered, and the
  lost verifier reduces the Effective Witness Count rather than being quietly dropped.

## What is *not* an inference

When the input is a URL, `lib/extract.ts` fetches that page and strips it to text. That is retrieval
over the public web, not model inference, and no model outside the Gonka Network is involved at any
point — the fetched text is handed straight to Gonka-hosted models, which do all the reasoning about
it. The fetch is guarded against SSRF: only `http`/`https`, no redirects, and any host resolving to a
loopback, private, link-local or carrier-grade-NAT address is refused.
