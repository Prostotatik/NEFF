# Quorum

**Three models agreeing is one witness if they all read the same page.**

Quorum is a fact checker that treats model agreement as a claim to be verified rather than as
evidence. Every inference runs on the [Gonka Network](https://gonkarouter.io) — eleven of them per
check, each traceable to the node that served it.

```
./init.sh          # clean checkout to a running demo, with a live Gonka connectivity check
```

---

## The problem with the obvious build

The obvious decentralised fact checker asks N models "is this true?", averages their answers, and
prints a confident number. Its whole claim to neutrality is that several independent models agreed.

They are not independent. Frontier language models share pretraining corpora, distillation ancestry
and alignment pipelines, and they make the same mistakes as a result.
[*Nine Judges, Two Effective Votes*](https://arxiv.org/abs/2605.29800) measures a panel of nine LLM
judges and finds it "effectively provide[s] only about 2 independent votes' worth of information" —
three quarters of the panel's nominal independence lost to correlated error, and an accuracy gap of
8–22 points against what genuinely independent voting would achieve.
[arXiv:2604.07650](https://arxiv.org/abs/2604.07650v1) finds the same thing from the other direction:
the more entangled the judges, the worse the bias, and reweighting by measured independence beats
majority voting by up to 4.5%. Majority voting only improves on a single model when errors are
*uncorrelated* — that is the premise of the Condorcet Jury Theorem, and it is exactly the premise a
panel of LLMs violates.

So the naive design fails in the worst possible direction: it is *most* confident precisely when the
models are wrong together. A unanimous panel prints 95% and moves on.

## What Quorum does instead

For every claim, each model on the panel is asked three separate, isolated questions:

| Probe | What it asks | What it catches |
|---|---|---|
| **claim** | Assess this claim. Name your evidence. | the stance and confidence |
| **mirror** | *(the claim's negation, presented blind as if it were the original)* | a model that answers the claim and its negation the same way is reading the shape of the sentence, not the fact — its vote carries no information |
| **evidence** | What body of evidence does this rest on? | models leaning on the *same* source are one witness, not three |

Those two measurements produce the number the whole product exists to report:

> **Effective Witness Count** — how many genuinely independent verifiers are behind a verdict.

It is Kish's effective sample size for correlated observations — the standard design-effect
correction, already applied to LLM panels in *Nine Judges, Two Effective Votes*:

```
EWC = k / (1 + (k − 1) · ρ)
```

where `k` is the count of agreeing models weighted by whether each passed its mirror probe, and `ρ`
is their measured evidence overlap. The estimator is not the contribution here; measuring `ρ` per
claim, at query time, from the models' own stated evidence — and putting the result in front of the
reader as part of the verdict — is. When a model will not name a source, `ρ` for that pair cannot be
measured, and a documented prior is used instead and **labelled as assumed on screen**; the prior is
derived by inverting the same estimator on that paper's nine-judges-two-votes result, giving 0.44.

Three models on three distinct sources gives 3. Three models on one source gives exactly 1. A panel
where every model failed the mirror probe gives 0.

The truth score is then shrunk toward "unresolved" by `EWC / (EWC + 1)`, so a verdict can only be as
confident as the independent evidence behind it — and **no verdict ever reaches 0 or 100**, because a
panel of language models is evidence, never proof.

### What that looks like in practice

Both of these are real runs against the live router, reproducible from the example buttons on the
home screen:

- *"Taking vitamin C supplements prevents the common cold."* — **3 of 3 models agreed.** All three
  named the same Cochrane systematic reviews: 89% measured evidence overlap, **1.1 effective
  witnesses**. The naive build would report unanimous agreement. Quorum reports one witness, quoted
  three times.
- *A Wikipedia article on the Streisand effect* — **MiniMax M2.7 answered REFUTED to the claim and
  REFUTED to its negation.** Its vote is thrown out with the transcript of both answers shown side by
  side. Two coherent witnesses remain, worth 1.2 after their evidence overlap is priced in.

The second one is the point. Products exist that flag a single model's answer as low-trust —
Cleanlab's Trustworthy Language Model scores self-consistency across resamples, for instance. What
none of them report is *how many independent witnesses stand behind a verdict*, with the probe
transcript that shows which one was discarded and why.

## What you get back

- a **Truth Score** from 0 to 100 with a credible band derived from the Effective Witness Count, and
  the arithmetic that produced it, on screen
- the **load-bearing fact** the verdict rests on, and **what evidence would flip it**
- a **panel view**: every model's stance, confidence, reasoning, evidence base, and its answer to the
  mirror probe next to its answer to the claim
- a **receipt ledger**: every inference in the run with its Gonka request id, the devshard node
  that served it, the engine build, latency, tokens, and the full request and response — expand any
  row, copy the request body, and re-run that exact step against the same gateway yourself
- a permanent link to the report

## How it uses Gonka

Every piece of reasoning in this application runs on `api.gonkarouter.io`. There is no other
inference provider in the codebase, not behind a flag and not commented out — `lib/gonka.ts` is the
only module that talks to a model, and there is deliberately no provider abstraction that would let
that change quietly. Details, including how the request ids are captured and what is *not* an
inference, are in [`docs/GONKA.md`](docs/GONKA.md).

Panel: `deepseek-ai/DeepSeek-V4-Flash-0731`, `MiniMaxAI/MiniMax-M2.7`, `moonshotai/Kimi-K2.6`.

## Why this is not a reskin

Decentralised multi-verifier fact checking has been built and has already won a hackathon, and
confidence-weighted model consensus has too. Both ship the same statistical bug: they treat agreement
as corroboration without ever checking whether the agreement is independent. Quorum inverts that
primitive — it measures verifier independence at query time and prices the verdict by it, which
produces an artifact none of them can produce: *"all three models agreed, that agreement is worth one
witness, and here is the probe transcript that proves it."* The full search, the candidates found,
and the argument are in [`PRIOR_ART.md`](PRIOR_ART.md).

## Running it

```bash
cp .env.example .env       # then put your Gonka Router key in it
./init.sh                  # installs, checks the router is reachable, starts on :3000
./init.sh --check          # environment and connectivity only
npm test                   # 50 unit tests over the scoring, parsing and URL guard
npm run test:live          # 4 tests against the live Gonka Router
npm run browser:check      # drives the real app in a browser and screenshots what it did
```

The key is read server-side only, from `.env`, which is git-ignored and has never been committed.

For a public URL: `npm run share` tunnels the local app and prints one, with no account needed; for a
real deployment it is four commands on Vercel. Both are in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Where things are

| Path | What it is |
|---|---|
| `lib/gonka.ts` | the only module that calls a model; captures request id, node id, usage |
| `lib/score.ts` | the argument: discrimination, evidence overlap, Effective Witness Count, truth score |
| `lib/prompts.ts` | the neutrality prompts, and why the mirror probe has to be blind |
| `lib/verify.ts` | the 11-call run, streamed as each node answers |
| `components/Report.tsx` | verdict card, panel, receipt ledger |
| `PRIOR_ART.md` | the originality search |
| `JUDGING_CRITERIA.md` | the organizers' criteria, quoted verbatim, and what serves each |
| `DECISIONS.md` | every judgement call made without a human, and why |
