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
- *Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels* —
  arXiv 2605.29800. A panel of nine LLM judges "effectively provide only about 2 independent votes'
  worth of information"; three quarters of the panel's nominal independence is lost to shared
  mistakes, and its accuracy falls 8–22 points short of independent voting.
  <https://arxiv.org/abs/2605.29800>
- arXiv 2604.07650, which has been retitled between versions — v1 is *How Independent are Large
  Language Models? A Statistical Framework for Auditing Behavioral Entanglement and Reweighting
  Verifier Ensembles*, and the current version is *A Statistical Framework for Auditing Behavioral
  Dependence and Induced Bias in LLM Judges*. A dependence metric predicts judge-precision
  degradation (Spearman 0.64 and 0.71), and entanglement-aware reweighting beats majority voting by
  up to 4.5%. <https://arxiv.org/abs/2604.07650>
  (Corrected 2026-09-04: an earlier draft of this file attributed "r ≈ 0.77, three models ≈ 1.3
  independent" to this paper. That figure is not in it. Every number quoted in the repo now comes
  from an abstract that has been read.)
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
higher agreement rate produces a higher truth score. **NEFF inverts the primitive.** It treats
agreement as a *claim that itself has to be verified*, because agreement between models trained on
overlapping corpora is correlated error, not corroboration — one witness reading one page, counted
three times. So NEFF does not just poll the models: for every claim it runs a **three-probe
adversarial battery** against each model — the claim as stated, the claim *negated* and presented as
if it were the original (a model that affirms both is pattern-matching, and its vote is discounted
toward zero), and a forced *evidence-anchor* probe that names the concrete sources each model is
leaning on (models converging on the same anchor are counted as one witness, not three). Those probes
produce a measured **Effective Witness Count** — the number of genuinely independent verifiers behind
a verdict, which is routinely 1.x when the nominal vote is 3/3 — and the truth score is discounted by
it. Which means NEFF can output the one thing no other fact checker on this list can: *"all three
models agreed, and that agreement is worthless, here is the probe transcript that proves it."*
That is a different mechanism producing a different, falsifiable artifact — not a nicer UI over
averaged verdicts. It is also, precisely, the organizers' "successor of a previously failed idea":
the decentralized multi-verifier fact checker already won a hackathon and still shipped the
statistical bug that makes its score meaningless; NEFF is that idea with the bug fixed.

## Standing risk (re-check before completion)
- If a judge asks "isn't this just multi-agent debate?" — no. Debate (Du et al., *AI Safety via
  Debate*) pits models against each other to reach a *better verdict*. NEFF's probes are not a
  debate and do not aim at a better verdict; they measure a *property of the panel itself*
  (independence) and use it to price the verdict's confidence. Debate produces an answer;
  NEFF produces an answer plus a defensible uncertainty on it.

---

# Audit pass — 2026-09-04 (prior-art-scout, concept lock)

Adversarial re-run of the originality gate against the mechanism as the repo currently describes it.
This section was written by an auditor instructed to find a disqualifying lookalike, not to reassure.

**Mechanism searched (branding stripped):** *ask a panel of LLMs a claim; separately ask each the
claim's negation presented blind as if it were the original; separately ask each to name the evidence
it is leaning on; then compute an effective-sample-size number of genuinely independent verifiers from
negation-consistency and cross-model evidence overlap, and shrink the confidence by that number.*

**Coverage:** 12 distinct web queries plus 5 direct page fetches, across Devpost/HackerEarth/MLH and
hackathon-winner announcements, Product Hunt and general commercial web, GitHub, and arXiv. Queries
targeted the *mechanism* and the *user-visible outcome* separately — verifier-independence
measurement, negation/mirror probes, evidence-source overlap between models, effective sample size on
an LLM panel, "models agree for the same reason", multi-model consensus fact checkers.

## Candidates found

### Shipped commercial products — multi-model consensus with an agreement number

- **Council AI** — <https://council-ai.app/ai-council> — 39+ frontier models answer in parallel; a
  moderator model emits a numeric agreement score plus a synthesised answer.
  → **DISTINCT.** The score is *nominal* concordance; nothing discounts it. Fetched page confirms no
  correlation adjustment, no negation probe, no source-overlap term, no effective-model count. Its FAQ
  asserts "different models from different labs have different failure modes; combining them
  de-correlates errors" — the precise assumption NEFF measures and routinely falsifies. This is the
  strongest *market* example of the naive build, and it argues for NEFF rather than against it.
- **Consensus AI** — <https://www.useconsensus.ai/> — isolated answers from ChatGPT/Claude/Gemini
  reconciled into one confidence-scored verdict. → **DISTINCT.** Same primitive: agreement raises
  confidence; independence never measured.
- **AllChat** — <https://askallchat.com/blog/ai-consensus-explained/> — four frontier models in
  parallel, one consensus answer. → **DISTINCT**, as above.
- **ByteChat Consensus mode** — <https://bytechat.io/blog/what-is-ai-consensus> — judge model weighs
  every bot's answer, returns one verdict with a confidence score. → **DISTINCT**, as above.

### Shipped commercial products — fact checking

- **Is it Fake?** — <https://get.isitfake.app/> — URL/article checker "powered by Gemini, OpenAI and
  Anthropic", outputs a 0–100 Trust Score and "6 of 8 claims supported by independent sources".
  → **DISTINCT**, and this is the closest consumer-facing surface match, so name the difference
  precisely: its "independent" qualifies the *web sources cited*, never the *models*. Fetched page
  shows no cross-model agreement measurement at all, no negation testing, no citation-overlap metric
  between models. Three models are used to widen coverage, not audited against each other.
- **The Arc-Hives Index** — claim verification that traces claims to primary records and
  *architecturally disqualifies wire-service reports, aggregator sites and same-event coverage as
  independent corroboration*, returning "unverifiable" rather than a false consensus.
  → **DISTINCT — but this is the nearest conceptual neighbour found anywhere**, because it ships the
  same slogan NEFF is built on ("many copies of one witness is still one witness"). The difference
  is the axis: Arc-Hives de-duplicates *documents in a news graph*; NEFF de-duplicates *verifiers in
  a model panel*, and does it at query time from the models' own answers. No model panel, no negation
  probe, no effective-witness number. If a judge raises it, this is the answer.
- **Cleanlab Trustworthy Language Model** — <https://cleanlab.ai/blog/trustworthy-language-model/>,
  <https://github.com/cleanlab/cleanlab-tlm> — shipped, paid API that attaches a trustworthiness score
  to any LLM response via self-reflection plus *observed consistency across multiple sampled
  responses*.
  → **DISTINCT, and the closest shipped mechanism to the mirror probe** — record it honestly. TLM
  measures one model's self-consistency across resamples of *its own answer* to *the same question*;
  NEFF's mirror probe asks a *different question* (the negation, presented blind) and uses the
  result as a gate on that model's vote, then combines it with a *cross-model* evidence-overlap term.
  TLM prices one model's uncertainty; NEFF prices a panel's redundancy. TLM produces no count of
  independent verifiers and has no cross-model term at all.
- **Originality.ai Automated Fact Checker, Full Fact AI, ClaimBuster, Logically, NewsGuard, Google
  Fact Check Explorer** — single verdict plus sources. → **DISTINCT** (unchanged from Phase 0).

### Hackathon entries and winner galleries

- **Trust Me Bro** — <https://devpost.com/software/trust-me-bro> (HackNC 2023) — Chrome extension that
  spins up multiple ChatGPT instances on the same prompt, averages pairwise similarity into a 0–1
  confidence score shown under the answer. No prize recorded on the page.
  → **DISTINCT, and instructive.** It is the naive build in miniature: it resamples *one* model, so it
  measures decoding variance, not verifier independence, and it treats agreement as confidence — the
  exact inversion NEFF exists to correct. Its existence at a hackathon is prior art for
  "multi-sample agreement = confidence bar", not for independence measurement.
- **VeriFact AI** — <https://devpost.com/software/verifact-ai> — LLM + Google grounding, per-claim
  TRUE/FALSE/UNSURE with explanations and grounding indices. → **DISTINCT.** Single verifier, external
  grounding, no panel property measured.
- **TruthTell Hackathon** (ICEA / MIB, WAVES Summit 2025) top-5 winners, incl. **Anvesha** (Team
  Unicron) — <https://icea.org.in/truthtell/>, <https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2119864>
  — multimodal misinformation and manipulated-media detection across text, image, video.
  → **DISTINCT.** Detection of manipulated media; no multi-verifier independence claim.
- **Flare Fact Checker**, **NFT Deep Appraisal** (Flare x Google Cloud), **cheqd Verifiable AI**,
  EasyA x Consensus galleries — re-checked, unchanged from Phase 0. → **DISTINCT** by the same
  argument already recorded above: verifier count is asserted, never measured.
- Searches of MLH Global Hack Week AI/ML and GenAI challenge galleries, lablab.ai recent winners, and
  ETHGlobal (NYC / Buenos Aires / Paris prize pages) returned **no** entry that measures verifier
  independence or discounts a consensus for correlated verifiers.

### GitHub

- **cleanlab/cleanlab-tlm** — client for the above. → **DISTINCT** (see TLM).
- **tanny411/llm-reliability-and-consistency-evaluation** — offline benchmark of LLM factual
  consistency under prompt/format variation. → **DISTINCT.** Research harness over a fixed dataset; no
  per-query product, no panel-independence number, no user-facing artifact.
- **NVIDIA/garak** — LLM vulnerability scanner with probe plugins. → **DISTINCT.** Red-teaming a
  single model for failure modes; not a fact checker, not a panel measurement.
- **baaivision/JudgeLM**, **aws-samples/evaluating-large-language-models-using-llm-as-a-judge**,
  **llm-as-a-judge/Awesome-LLM-as-a-judge**, **anakin87/fact-checking-rocks**,
  **kalmiallc/fact-checker**, **othmanelhoufi/LM-for-FactChecking** — judging and fact-verification
  scaffolds. → **DISTINCT.** All aggregate verdicts; none measures whether the aggregands are
  independent.
- **No public repository was found** implementing Kish effective sample size over an LLM panel as a
  runnable tool, including for the paper that introduces it (below).

### Research (already-productised-by-a-group check)

- **Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels** —
  <https://arxiv.org/abs/2605.29800> — **uses exactly NEFF's formula**: pairwise phi between judges,
  then Kish `n_eff = k / (1 + (k−1)·ρ̄)`; 9 frontier judges from 7 families yield ≈2 effective votes.
  → **DISTINCT as a product, but this must be stated plainly: the arithmetic in `lib/score.ts` is not
  novel and NEFF should not claim it is.** The paper measures ρ *offline, post hoc, from a labelled
  benchmark* over many items, to advise eval-pipeline designers. NEFF estimates independence
  *per claim, at query time, from the models' own probe answers, with no labels and no ground truth*,
  and renders it to an end user as a verdict discount with the transcript that justifies it. No code,
  demo, product or hackathon entry attached to the paper was found.
- **How Independent are Large Language Models?** — <https://arxiv.org/abs/2604.07650v1> — dependence predicts judge-precision degradation (Spearman 0.64 / 0.71); reweighting beats majority voting by up to 4.5%
  entanglement, reweighted verifier ensembles. → **DISTINCT** (research; already cited by the repo).
- **AutoVerifier: An Agentic Automated Verification Framework Using LLMs** —
  <https://arxiv.org/pdf/2604.02617> — orchestrates heterogeneous LLMs as verification agents with
  independence/overlap-aware weighting of what they rely on.
  → **DISTINCT — nearest academic neighbour on "independence-weighted consensus".** Fetched: no
  negation or inverted-claim probe, no Kish/effective-sample-size computation, and no released repo,
  demo, or deployable product. It is an orchestration framework, not a shipped artifact, and it
  produces a better verdict rather than a measured count of independent witnesses.
- **Design and Evaluation of Multi-Agent AI Oracle Systems for Prediction Market Resolution** —
  <https://arxiv.org/html/2605.30802v1> — confidence-weighted independent aggregation wins (83.4%);
  deliberative consensus *degrades* to ~76% via sycophancy. **The Oracle's Fingerprint** —
  <https://arxiv.org/html/2605.00844> — GPT/Claude/Gemini forecasting errors correlate at r = 0.78,
  "the three models function as a single oracle". → **DISTINCT** (research), and both are strong
  supporting citations for the premise.
- **Probing the Geometry of Truth** — <https://arxiv.org/pdf/2506.00823> — whether truth directions
  hold under negation. → **DISTINCT.** White-box activation probing; NEFF's mirror probe is a
  black-box behavioural test usable through a router API.
- **When LLM judges agree, should we believe them?** (Amazon Science) and **orq.ai LLM juries** —
  both explicitly recommend "report confidence adjusted for judge correlation" and note "three
  correlated judges are one judge with 3× more requests". → **DISTINCT — but note the exposure:** the
  recommendation is now public and unimplemented. It is guidance in a blog, not a product; NEFF is
  the implementation. This narrows the novelty window rather than closing it.
- **digitalapplied.com, "Three Models Agreed. It Was Still Wrong"** —
  <https://www.digitalapplied.com/blog/cross-model-review-consensus-verification-2026> — fetched and
  confirmed to be a written consulting methodology, **no software**, no independence measurement, no
  probes. → **DISTINCT.**
- Eval platforms (**Patronus**, **Galileo**, **Arize Phoenix**) ship LLM-as-judge tooling; no
  shipped verifier-independence or judge-correlation metric surfaced in any of them by these searches.

## Verdict

No shipped product, hackathon entry, or public demo was found that measures verifier independence at
query time and reports it to an end user as the headline number. The two components each have a close
neighbour — the Kish estimator is published for LLM panels (2605.29800), and consistency-probe-derived
trust scores ship commercially (Cleanlab TLM) — but no one found combines a blind-negation gate on
each model's vote with a measured cross-model evidence-overlap term to produce a per-claim count of
independent witnesses, and no one shows the probe transcript that justifies the discount.

## Standing risks to answer before completion (new since Phase 0)

1. **Do not claim the estimator is novel.** `n_eff = k / (1 + (k−1)ρ)` applied to an LLM panel is
   published in arXiv 2605.29800. NEFF's contribution is per-query, label-free, user-facing
   measurement, not the formula. Cite the paper rather than let a judge find it.
2. **README overclaim.** "No other fact checker can tell you that one of its verifiers wasn't actually
   reading" is stronger than this audit supports — Cleanlab TLM flags a low-trust response per query,
   in production, today. The defensible version is that no other tool reports *how many independent
   witnesses* stand behind a verdict, or shows the probe transcript that proves a vote was discarded.
3. **"Multi-model consensus with an agreement score" is a crowded shipped market** (Council AI,
   Consensus AI, AllChat, ByteChat) and a crowded hackathon lane. The demo must land the *inversion*
   in the first ten seconds — high nominal consensus next to a low Effective Witness Count — or it
   reads as another consensus app.
4. **Re-run this gate before any completion claim.** The Amazon Science and orq.ai guidance shows the
   idea is being written about publicly right now; the window is real but not wide.

GATE: PASS - no unanswered lookalike as of 2026-09-04

---

# Audit pass — 2026-09-04 (prior-art-scout, second pass, pre-completion)

Second adversarial re-run, against the mechanism **as now shipped**, not as it was at concept lock.
The concept has changed since the first pass (three probes per model rather than two conceptually;
zeroed votes with both answers shown; Kish `n_eff` over measured evidence overlap; a labelled
documented prior where overlap is unmeasurable; an on-screen "Effective Witness Count" beside the
nominal vote). The previous section's conclusion was treated as unproven and re-derived from scratch.

**Mechanism searched (branding stripped):** *probe each model on a panel three ways — the claim, the
claim's negation presented blind as a fresh request, and a demand to name the evidence base it is
leaning on; set to zero the vote of any model that answers the claim and its negation the same way and
show both answers; measure how far the models' named evidence bases overlap; collapse the surviving
votes into Kish's effective sample size; print that number to the end user as the count of independent
witnesses behind the verdict, and shrink the truth score by it.*

**Coverage this pass:** 12 distinct web queries and 7 direct page fetches. Surfaces: Devpost (via
domain-restricted search after the on-site search endpoint returned no fetchable content), ETHGlobal,
lablab.ai, MLH, DoraHacks and HackerEarth galleries; Product Hunt and the general commercial web;
GitHub; arXiv and lab research blogs (Apple ML Research, Amazon Science). Queries deliberately split
between the *technique* (Kish effective sample size on an LLM panel, design effect, negation/inverted
claim probes, cross-model evidence-source overlap, judge-correlation adjustment) and the *user-visible
outcome* (a fact checker that discards a model's vote, telling a user model agreement is meaningless,
showing how many independent sources an answer really has, an effective-witness number).

## New candidates found this pass

### Name collisions — resolved by the rename to NEFF (2026-09-05)

This section was written when the product was called Quorum, and it is kept because the finding
that forced the rename is part of the record. Four shipped or near-shipped products in this exact
space are called some form of "Quorum": a judge searching the old name landed on them before it
landed on us, and one of them — `qinnovates/quorum` — also reports an independence score.

**NEFF collides with none of them.** The name is taken from `N_eff`, the effective sample size,
which is the quantity this product actually reports; searching it does not lead to a committee-of-
models tool by another author. The entries below stand as written, describing the products, with
their own names restored.

This is new since the first pass and is recorded here because a judge searching the product name lands
on these before it lands on us. None is a mechanism lookalike; all are a submission risk.

- **PromptQuorum** — <https://www.promptquorum.com/features>,
  <https://www.promptquorum.com/blog/what-is-ai-consensus-scoring> — beta product (waitlist +
  downloadable beta). One prompt fanned out to 25+ models, then a five-step "**Quorum Verdict**":
  parallel dispatch → claim extraction → agreement mapping → confidence weighting → divergence
  flagging, with 13 consensus analysis types including hallucination and contradiction scoring.
  → **DISTINCT.** Fetched and confirmed: confidence weights come from *capability benchmarks*, not
  from measured dependence. No negation probe, no evidence-anchor probe, no cross-model source-overlap
  term, no effective-sample-size correction, no count of independent models. Its headline is 5/5 models
  agreeing — the nominal number NEFF exists to discount. It is the naive build at 25× the panel size,
  and it wore the name this project used to have.
- **Quorum (aiquorum.app)** — <https://www.aiquorum.app/> — "every decision deserves a committee";
  Democratic / Deliberative / Evidence-Based modes over several models, verdict plus agreement and
  disagreement. → **DISTINCT.** Fetched: no correlation or independence metric, no negation probe, no
  effective-model count; confidence is a qualitative "High / Medium-High" label.
- **AskQuorum AI** — <https://askquorumai.com/> — "from consensus, everything". → **DISTINCT**, same
  primitive as above.
- **AISCouncil** — <https://www.aiscouncil.com/> — seven modes including "Consensus Vote (democratic
  scoring)" and "Mixture of Agents". → **DISTINCT.** Vote tallying; independence never measured.

### GitHub — the closest open-source neighbour found in either pass

- **qinnovates/quorum** — <https://github.com/qinnovates/quorum> — CLI that spawns 5–15+ specialised
  agents to debate a question with mandatory adversarial critics, and reports a verdict carrying a
  **convergence score**, an **"INDEPENDENCE SCORE: 0.81 (HIGH)"**, bias flags, a **cross-model
  agreement %**, an **evidence scorecard with source deduplication**, and a disagreement register.
  → **DISTINCT — but this is the nearest lookalike found anywhere, it shared the name this project
  used to have, and the difference has to be stated precisely rather than waved at.** Fetched the repo page and the raw
  README. Four separable differences:
  1. **Different object measured.** Its independence score grades how far agents *diverged during a
     debate* — groupthink detection over a shared transcript. NEFF's agents never see each other;
     the number is a statistical dependence estimate between blind, isolated verifiers.
  2. **Diversity is manufactured, not measured.** It *assigns* each agent a cognitive-diversity
     profile (risk tolerance, skepticism, abstraction) to create tension. NEFF assigns nothing and
     measures what the panel actually did on this claim.
  3. **No estimator, no probe, no witness count.** The README publishes no formula; there is no Kish
     / design-effect correction, no blind-negation probe, no vote set to zero, and the output is a
     0–1 quality grade, not a count of independent witnesses that shrinks a truth score.
  4. **Not a fact checker.** It is a deliberation tool for hard questions; fact-checking is one
     validation layer inside it. It produces a better answer; NEFF produces an answer plus a
     defensible number for how much of the panel's agreement was real.
  Its own docs concede the point NEFF is built on: "the validation gate is not truly independent…
  that's prompt-level independence, not structural independence." Unmeasured, and admitted.
- **karpathy/llm-council** — <https://github.com/karpathy/llm-council> — models answer, then rank each
  other's answers, then a chairman synthesises. → **DISTINCT.** Peer ranking; no dependence term.
- **focuslead/ai-council-framework** — <https://github.com/focuslead/ai-council-framework> —
  structured debate, consensus synthesis, "bias reduction". → **DISTINCT.** Bias reduction by protocol,
  not by measurement; no independence number.

### Shipped tools that do measure source overlap — but on a different axis

New candidate class this pass, and the honest one to record, because "measure whether the sources
overlap" *is* shipped software today.

- **Profound** (<https://www.tryprofound.com/blog/citation-overlap-strategy>), **Similarweb AI
  Citation Analysis** (<https://aisearch.similarweb.com/ai-brand-visibility/citation-analysis/>),
  **Otterly.ai**, and the Writesonic (161,286 prompts) and Wellows overlap studies — all measure
  **citation overlap between AI answer engines** (ChatGPT vs Perplexity vs Gemini vs AI Overviews),
  reporting figures like 11–17% shared domains and 79.6% single-engine sources.
  → **DISTINCT, and the difference is the purpose, not the arithmetic.** These are GEO/AEO marketing
  tools: they measure overlap so a brand can buy visibility across engines. They compare *which web
  pages each engine cited*, aggregated over many prompts, and no output of theirs discounts a verdict,
  gates a vote, or tells a reader how much a given answer should be believed. NEFF measures overlap
  between *verifiers on one claim, at query time*, and spends it as confidence. Worth knowing that the
  number exists commercially; nobody is using it for epistemics.

### Research neighbours new since the first pass

- **Blind to the Pivotal Vote: Aggregate Independence Metrics Miss Where Verification Actually Helps**
  — <https://arxiv.org/abs/2608.06940> — **the most consequential find of this pass, and it is not a
  lookalike but a loaded gun pointed at our headline number.** Fetched abstract: aggregate dependence
  metrics are "fundamentally disconnected from practical utility"; adding a genuinely external
  verifier moved the panel's aggregate effective-vote count by −0.04 (95% CI [−0.10, +0.02]) while
  producing +10.4 to +23.3 points on *pivotal, one-vote-margin* decisions and exactly zero elsewhere.
  "Aggregate dependence and conditional decision utility are different questions."
  → **DISTINCT** (paper, no code, no product, no demo). But see standing risk 3 below: a judge who
  has read it can ask why an aggregate `n_eff` is the right thing to put on the card.
- **Partially Correlated Verifier Cascades in LLM Harnesses** —
  <https://arxiv.org/html/2607.13918v1> — correlation as a "double penalty" across verifier gates,
  with blind-spot ceilings. → **DISTINCT.** Theory of cascades; no artifact.
- **CARE** (confounder-aware aggregation modelling inter-judge correlations, cited in 2605.29800's
  related work; reduces aggregation error up to 25%), **RoPoLL: Robust Panel of LLM Judges**
  (<https://arxiv.org/pdf/2606.30931>), **A Finite-Calibration Regime Map for LLM Judge Panels**
  (<https://arxiv.org/pdf/2606.01034>), **When the Judge Changes, So Does the Measurement**
  (<https://arxiv.org/html/2607.08535v1>), **The Ringelmann Effect in Multi-Agent LLM Systems: A
  Scaling Law for Effective Team Size** (<https://arxiv.org/pdf/2606.02646>).
  → **DISTINCT.** All correct the *aggregate* to get a better score for eval engineers. None reports a
  per-claim witness count to an end user; none ships.
- **Learning to Trust the Crowd: A Multi-Model Consensus Reasoning Engine** —
  <https://arxiv.org/pdf/2601.07245> — states the premise almost in our words ("models that have
  similar training data and inductive biases may agree on the same falsehoods") and learns over the
  graph of who disagrees with whom. → **DISTINCT.** A learned aggregator that exploits disagreement
  structure to produce a *better answer*; fetched and found no negation probe, no evidence-anchor
  probe, no user-facing effective-model count, and no released tool.
- **Evaluating Superhuman Models with Consistency Checks** —
  <https://arxiv.org/pdf/2306.09983> — negation prompting and paraphrase prompting as consistency
  checks. **The Impact of Negated Text on Hallucination with LLMs** —
  <https://arxiv.org/pdf/2510.20375> — post-negation transformation, NegHalu dataset.
  → **DISTINCT as products, but they matter: the mirror probe is not a novel technique either.**
  See standing risk 2. Both are offline evaluation methods over datasets; neither gates a live vote
  nor combines with a cross-model term.
- **Contradiction to Consensus** (<https://arxiv.org/pdf/2602.18693>) — dual-perspective retrieval,
  supporting and refuting evidence, source-level disagreement. → **DISTINCT.** It negates the
  *retrieval*, not the model's own read of the claim, and reports source disagreement, not verifier
  dependence.
- **Debating to verify** (<https://www.sciencedirect.com/science/article/pii/S2405959526000883>),
  **Fusion-Augmented LLMs** (2510.16057), **Council of AIs on the USMLE** (medRxiv) → **DISTINCT.**
  All treat cross-model agreement as a validation signal; none audits it.

## Re-verification of the first pass's load-bearing claims

- **Nine Judges, Two Effective Votes (2605.29800) still ships no code.** Fetched the Apple Machine
  Learning Research page for it — abstract, authors, arXiv link and BibTeX only, with no repository,
  demo or tool. The gap between the published estimator and a runnable artifact is still open.
- **Council AI and AllChat re-checked, and their own copy has got *more* useful to us, not less.**
  Council AI: models answer "independently and in parallel, without seeing each other's responses,
  which is what keeps their errors uncorrelated." AllChat: "uses different model families so the
  failure modes are independent." Both assert independence as a property of the *setup*. Neither
  measures it. → **DISTINCT**, unchanged, and quotable.
- **Cleanlab TLM, Is it Fake?, Arc-Hives, Trust Me Bro, AutoVerifier, Flare Fact Checker, NFT Deep
  Appraisal** — re-searched, no change found in scope or mechanism. Verdicts from the first pass stand.
- **No shipped product or hackathon entry surfaced, on any of the surfaces above, that reports a
  count of effective independent verifiers to an end user.** The phrase "effective witness count" and
  its synonyms return only the correlated-judges literature and unrelated legal-witness pages.

## Standing risks to answer before completion (revised)

1. **Naming.** Four separate things in this exact market are called NEFF, including a beta product
   whose headline feature is literally a "NEFF Verdict" over 25+ models. This is not an originality
   problem — none of them measures independence — but the demo and the README must land the inversion
   before a judge pattern-matches us onto them. Carrying risk knowingly; not a gate failure.
2. **Two of the three ingredients are published, and the repo must not claim otherwise.** The Kish
   estimator on an LLM panel is 2605.29800 (already conceded in the README). The negation/consistency
   probe is also published (2306.09983, 2510.20375) — the README currently concedes the estimator but
   not the probe. The defensible claim is the *combination shipped live to a user*: a blind-negation
   gate on each vote, times a query-time cross-model evidence-overlap term, rendered as one witness
   count with the transcript that justifies it. Claim that, and nothing wider.
3. **New: an aggregate `n_eff` has a published critic (2608.06940).** The honest answer, and it is
   already half-written in the README's limits section, is that the Effective Witness Count is a
   *floor on the discount*, a reason to distrust a unanimous card, not a per-decision utility
   estimate — and that NEFF shows the transcript precisely so a reader can go and check the pivotal
   case themselves. If that answer is not in the README's "what this does not do", put it there.
4. **The 0.44 assumed prior is the softest number in the product.** It is derived by inverting one
   paper's result. It is labelled as assumed on screen, which is the right behaviour; keep it labelled
   and never let a headline number rest on it silently.
5. **Re-run this gate if the panel or the probe set changes again.** The concept moved materially
   between the two passes, and the first pass's conclusion would not have covered what shipped.

## Verdict

Nothing found on any surface delivers NEFF's user-visible artifact by NEFF's mechanism. The
closest neighbours are, in order: **qinnovates/quorum** (an independence score, evidence
deduplication — but it grades divergence inside a debate it manufactured, publishes no estimator, runs
no negation probe, zeroes no vote, and prints no witness count); **PromptQuorum** (25+
models, agreement mapping — capability-weighted, dependence never measured); the **citation-overlap
tools** (real overlap measurement, shipped, but for brand visibility rather than to discount a
verdict); and **2605.29800** (our exact estimator, still paper-only, still no artifact). Each fails the
test on a different axis, and none of them can print "three models agreed, that agreement is worth zero
witnesses, here is the transcript."

GATE: PASS - no unanswered lookalike as of 2026-09-04
