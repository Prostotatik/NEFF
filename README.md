<div align="center">

# NEFF

### Nine models agreeing is not nine opinions.

**NEFF measures how many *independent* voices are really behind an AI consensus — and prices the Truth Score by it.**

[![Gonka Network](https://img.shields.io/badge/inference-Gonka%20Router-00ffa3?style=for-the-badge&labelColor=0b0f0e)](https://gonkarouter.io)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&labelColor=0b0f0e)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&labelColor=0b0f0e)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?style=for-the-badge&logo=typescript&labelColor=0b0f0e)](https://www.typescriptlang.org)

<img src="docs/assets/idle.png" alt="NEFF — paste a link, a tweet or a claim and get a verification report" width="100%">

</div>

---

## The bug in every multi-model fact checker

Poll several models, average the votes, call the agreement evidence. But models share training
data, reasoning habits and failure modes — so they are **wrong together**, and averaging is most
confident exactly when the panel is most likely to be wrong.

Measured, not asserted: a panel of 9 frontier LLMs carries about
**[two independent votes](https://arxiv.org/abs/2605.29800)**, not nine.

> **NEFF does not claim to know the truth. It measures what the consensus is worth.**

```
   3 MODELS AGREE            →   a vote would say 3/3, 95% confident
          ↓
   MIRROR + EVIDENCE PROBES  →   do they track the fact, or the sentence?
          ↓                      do they lean on the same page?
   N_eff = 0.0
          ↓
   NO SIGNAL                 →   the agreement carries no information
```

That screen is real output, not a mock. ⤵

<img src="docs/assets/verdict.png" alt="Three models agreed at 95% confidence; NEFF scores it NO SIGNAL on 0.0 effective witnesses" width="100%">

---

## How one verification works

**11 inferences, every one on the Gonka Network**, streamed to the browser as each node answers.

```mermaid
flowchart LR
    IN["🔗 URL / tweet / text"] --> PREP["Claim extraction<br/>1 inference"]
    PREP --> CLAIM["one atomic claim<br/>+ its negation"]

    CLAIM --> P1["Probe 1 · direct<br/>the claim, as stated"]
    CLAIM --> P2["Probe 2 · mirror<br/>the negation, asked blind"]
    CLAIM --> P3["Probe 3 · anchor<br/>what evidence is this resting on?"]

    P1 --> FAN["3 models × 3 questions<br/>9 inferences, in parallel"]
    P2 --> FAN
    P3 --> FAN

    FAN --> SCORE["N_eff<br/>Kish effective sample size"]
    SCORE --> ADJ["Closing note<br/>1 inference"]
    ADJ --> OUT["Truth Score 0–100<br/>Reasoning trace<br/>Gonka Request IDs"]

    style IN fill:#0b0f0e,stroke:#00ffa3,color:#e8f5f0
    style OUT fill:#0b0f0e,stroke:#00ffa3,color:#e8f5f0
    style SCORE fill:#00ffa3,stroke:#00ffa3,color:#04150e
```

### Why three questions instead of one

```mermaid
flowchart TD
    A["3 models say SUPPORTED<br/>nominal consensus 3/3"] --> M{"Mirror probe:<br/>does it also affirm<br/>the opposite claim?"}

    M -->|"yes — same answer to both"| ECHO["🔇 Echo<br/>reading the sentence, not the fact<br/>vote → 0"]
    M -->|"no — opposite answers"| OK["✅ Coherent<br/>tracking the fact<br/>vote counts"]

    OK --> S{"Anchor probe:<br/>same evidence<br/>as the others?"}
    S -->|"same sources"| RED["♊ Redundant<br/>three readers of one page<br/>= one witness"]
    S -->|"distinct sources"| IND["🎯 Independent<br/>a real second witness"]

    ECHO --> N["N_eff — effective witnesses"]
    RED --> N
    IND --> N
    N --> T["Truth Score, shrunk toward<br/>'unresolved' by how few<br/>independent witnesses there are"]

    style ECHO fill:#2a1214,stroke:#f87171,color:#fca5a5
    style RED fill:#1a1a2e,stroke:#a78bfa,color:#c4b5fd
    style IND fill:#04241a,stroke:#00ffa3,color:#5eead4
    style N fill:#00ffa3,stroke:#00ffa3,color:#04150e
```

---

## Core functionality → where it lives

| The brief asks for | NEFF does | Code |
|---|---|---|
| **Claim Extraction** — a URL, tweet or text snippet | Fetches the page, reduces it to **one atomic, checkable claim** plus a faithful negation. Compound claims are rejected — they break the mirror probe | [`lib/extract.ts`](lib/extract.ts) · [`lib/prompts.ts`](lib/prompts.ts) |
| **Decentralized Verification** — Gonka-hosted models | 3 models × 3 probes, fired in parallel across independent Gonka nodes, with an adaptive concurrency gate and deadline-aware retries | [`lib/verify.ts`](lib/verify.ts) · [`lib/gonka.ts`](lib/gonka.ts) |
| **Truth Score & Reasoning Trace** | `0–100` score **with its own arithmetic on screen**, a credible band, and every model's full reasoning + the evidence it named | [`lib/score.ts`](lib/score.ts) · [`METHOD.md`](METHOD.md) |
| **Transparency UI** — Gonka Request IDs per step | A receipt ledger: **every inference, its `x-request-id`, its serving node, its engine build, latency, tokens**, and the exact request body — expandable, re-runnable by hand | [`components/ReceiptLedger.tsx`](components/ReceiptLedger.tsx) |

<div align="center">
<img src="docs/assets/report.png" alt="The full verification report: metrics strip, the panel witness by witness, and the receipt ledger" width="82%">
</div>

---

## Gonka Router integration

> **Mandatory requirement: all AI reasoning runs on the Gonka Network.**
> There is exactly **one** file in this repo that talks to a model, and it has no provider
> abstraction — deliberately, so no future edit can quietly route inference elsewhere.

**[`lib/gonka.ts`](lib/gonka.ts)** — every call, every retry, every receipt:

```ts
const response = await fetch(`${GONKA_BASE_URL}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model, messages, temperature: 0, max_tokens }),
  cache: "no-store",          // inference is never cacheable — and Next stalls without this
});

// The Gonka Request ID is in the *headers*, not the body.
const requestId  = response.headers.get("x-request-id");    // req-1788473643105856296-578027
const devshardId = response.headers.get("x-devshard-id");   // which node actually served it
```

**Multi-model consensus** — the panel, all Gonka-hosted ([`lib/models.ts`](lib/models.ts)):

| Model | Role | Per-model handling |
|---|---|---|
| `deepseek-ai/DeepSeek-V4-Flash-0731` | witness + claim extraction | shortest output of the three, quickest on extraction |
| `MiniMaxAI/MiniMax-M2.7` | witness + closing note | emits chain-of-thought inline in `<think>`; billed against `max_tokens` |
| `moonshotai/Kimi-K2.6` | witness | `chat_template_kwargs: { thinking: false }` — otherwise ~2000 reasoning tokens per probe |

Neutrality is enforced in the prompt and in the protocol: no probe is told what the others said,
the mirror probe is a **separate request with no shared context**, and a model that will not name
concrete evidence is asked to answer `UNCERTAIN` rather than guess.
Full integration notes: **[`docs/GONKA.md`](docs/GONKA.md)**.

---

## The score, and why you can check it

```
Truth Score = 50 + 50 × balance × weight

   balance  −1…+1   confidence-weighted stance of the panel
   weight   n/(n+1) conjugate-prior shrinkage, n = N_eff
   N_eff    k / (1 + (k−1)·ρ)     Kish, 1965
```

Every constant is labelled on screen as one of three things — **definition** (it follows from the
0–100 scale), **standard** (a published estimator, source named), or **chosen** (we picked it, and
the reasoning is stated, including which way it errs).

`npm run sweep:threshold` reproduces the argument for the one free parameter from the runs on disk,
in two seconds, with no Gonka calls. Long form: **[`METHOD.md`](METHOD.md)**.

> No verdict ever reaches 0 or 100. A panel of language models is evidence, never proof.

---

## Run it

```bash
cp .env.example .env      # add your Gonka Router key
./init.sh                 # checks the toolchain, the key, and live Gonka connectivity, then starts
```

| Command | What it does |
|---|---|
| `npm test` | 78 unit tests — scoring, parsing, retry policy, recovery |
| `npm run test:live` | live suite against the real Gonka Router |
| `npm run check:claim -- "<claim>"` | drives one real verification and prints every probe and retry |
| `npm run sweep:threshold` | reproduces the anchor-threshold argument from `.runs/` |

---

## What this does not do

Stated plainly, because a fact checker that hides its limits has no business asking for trust.

- **Text only.** The Gonka Router rejects image content (`unsupported value "image_url"`), and the
  brief makes Gonka mandatory for all reasoning — so there is no image path rather than a
  non-Gonka one.
- **No live web search.** Verification runs against the models' internal knowledge and the page you
  paste. Anchors name *bodies of evidence*, never fabricated citations.
- **Nothing is written to a chain.** On-chain proof is satisfied as the brief defines it
  operationally — every inference shows its Gonka Request ID and serving node.
- **`x.com` links cannot be read** server-side. Paste the post's text instead; it verifies the same.

<div align="center">

**N_eff is how many independent voices are really behind an agreement.**
Every inference routed through `api.gonkarouter.io`.

</div>
