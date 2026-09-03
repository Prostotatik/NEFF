# Prior Art — originality gate (Phase 0)

Re-run before any completion claim. Last full pass: 2026-09-04 (concept lock).

## What already exists in this exact space

### 1. Decentralized / multi-node AI fact checkers that already WON hackathons
- **Flare Fact Checker** (Flare x Google Cloud Hackathon winner) — RAG-based verification of
  scientific claims on Farcaster. Each verifier node in a TEE network returns a *correctness score*,
  a short explanation, and a list of supporting/refuting sources. Anyone can run a verifier node.
  <https://flare.network/news/google-cloud-hackathon-winners>
  → **This is the naive build for this challenge, and it has already won.** Paste claim → several
  independent AI verifiers → averaged correctness score + sources + decentralisation story.
  Building that again is disqualified by the organizers' own rule.
- **NFT Deep Appraisal** (same event) — consensus learning across AI models inside a TEE using
  *confidence-based weights* to beat single-model accuracy. Confidence-weighted multi-model
  consensus, on-chain, is therefore also already-used prior art.
- **cheqd Verifiable AI Hackathon** winners — verifiable-credential provenance for AI outputs.
  <https://cheqd.io/blog/congratulations-to-the-verifiable-ai-hackathon-winners/>
- EasyA x Consensus (Hong Kong 2025/2026, Miami 2026) galleries are saturated with
  "AI agent + on-chain receipt" projects.
  <https://www.coindesk.com/tech/2026/02/12/ai-powered-agents-dominate-the-easya-x-consensus-hong-kong-hackathon>

### 2. Commercial / production fact-checking products
- Full Fact AI, ClaimBuster (claim-worthiness ranking), Logically, NewsGuard, Originality.ai,
  Google Fact Check Explorer, Perplexity-style cited answers, Community Notes.
  All are single-verdict + sources. None expose *why* their verifiers agree.

### 3. Research that names the flaw everyone is about to ship
- *How Independent are Large Language Models? A Statistical Framework for Auditing Behavioral
  Entanglement and Reweighting Verifier Ensembles* — arXiv 2604.07650. Frontier LLM errors
  correlate at r ≈ 0.77; three models are ≈ 1.3 independent ones. Entanglement-aware reweighting
  beats majority voting by up to 4.5%. <https://arxiv.org/abs/2604.07650v1>
- *Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels* —
  arXiv 2605.29800. <https://arxiv.org/html/2605.29800>
- *Beyond Consensus: Mitigating the Agreeableness Bias in LLM Judge Evaluations* — arXiv 2510.11822.
- *Automatic Fake News Detection: Are current models "fact-checking" or "gut-checking"?* — arXiv 2204.07229.
  Models reach high accuracy while ignoring the evidence entirely.
- Condorcet Jury Theorem: majority voting only improves on the individual **when errors are
  uncorrelated**. Every "multi-model consensus" fact checker silently assumes the premise it violates.

**Searched and NOT found:** any shipped product, hackathon entry, or demo that *measures* verifier
independence at query time and reports it to the end user. The finding lives in 2026 papers; nothing
has been built on it.

## Why this concept is not a reskin

The already-won build (Flare Fact Checker, NFT Deep Appraisal) and every product above treat model
agreement as *evidence*: N verifiers answer, their scores are averaged or confidence-weighted, and a
higher agreement rate produces a higher truth score. **Quorum inverts the primitive.** It treats
agreement as a *claim that itself has to be verified*, because agreement between models trained on
overlapping corpora is correlated error, not corroboration — one witness reading one page, counted
three times. So Quorum does not just poll the models: for every claim it runs a **three-probe
adversarial battery** against each model — the claim as stated, the claim *negated* and presented as
if it were the original (a model that affirms both is pattern-matching, and its vote is discounted
toward zero), and a forced *evidence-anchor* probe that names the concrete sources each model is
leaning on (models converging on the same anchor are counted as one witness, not three). Those probes
produce a measured **Effective Witness Count** — the number of genuinely independent verifiers behind
a verdict, which is routinely 1.x when the nominal vote is 3/3 — and the truth score is discounted by
it. Which means Quorum can output the one thing no other fact checker on this list can: *"all three
models agreed, and that agreement is worthless, here is the probe transcript that proves it."*
That is a different mechanism producing a different, falsifiable artifact — not a nicer UI over
averaged verdicts. It is also, precisely, the organizers' "successor of a previously failed idea":
the decentralized multi-verifier fact checker already won a hackathon and still shipped the
statistical bug that makes its score meaningless; Quorum is that idea with the bug fixed.

## Standing risk (re-check before completion)
- If a judge asks "isn't this just multi-agent debate?" — no. Debate (Du et al., *AI Safety via
  Debate*) pits models against each other to reach a *better verdict*. Quorum's probes are not a
  debate and do not aim at a better verdict; they measure a *property of the panel itself*
  (independence) and use it to price the verdict's confidence. Debate produces an answer;
  Quorum produces an answer plus a defensible uncertainty on it.
