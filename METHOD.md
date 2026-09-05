# Where every number in the score comes from

Quorum prints a truth score out of 100 and an Effective Witness Count. Both are built out of a
handful of constants, and a fact checker that will not say where its own constants came from has no
business asking anyone to trust its arithmetic.

Every number used anywhere in `lib/score.ts` is listed below with one of three honest labels:

- **Definition** — it follows from the shape of the output, not from a choice. There is nothing to
  tune.
- **Standard** — it is a published estimator, used as published, with the source named.
- **Chosen** — we picked it. The reasoning is written out, including which way it errs and what
  choosing differently would have done to the numbers on screen.

Nothing here is retrofitted to make a demo land. Where a different value would have produced a more
striking result, that is said in as many words.

---

## The truth score

```
truthScore = 50 + 50 × balance × weight
```

### `50 + 50 ×` — **Definition**

The brief asks for a score on 0–100. On that scale the midpoint is "the evidence points neither
way", and 50 is the largest excursion that keeps the result inside the scale. Both 50s are the
scale, not coefficients: change either one and the output stops being a 0–100 score. There is no
version of this formula in which 40 would have been an alternative.

The consequence is deliberate: the score can reach 0 or 100 only if `balance × weight = ±1`, and
`weight` is strictly below 1 for any finite number of witnesses. **No verdict Quorum can produce is
ever 0 or 100.** A panel of language models is evidence, never proof.

### `balance` — **Definition**

The discrimination- and confidence-weighted mean of the panel's stance signs, on −1 (refuted) to +1
(supported):

```
balance = Σ (discrimination_i × confidence_i × sign_i) / Σ (discrimination_i × confidence_i)
```

with `sign` = +1 SUPPORTED, −1 REFUTED, 0 UNCERTAIN. A weighted mean has no free parameter. The
weights are the two things already measured per model: whether it can tell the claim from its
negation, and how confident it says it is.

### `weight` — **Standard**

```
weight = n / (n + 1)          n = the Effective Witness Count
```

This is the shrinkage factor of a conjugate-prior posterior mean. For a parameter estimated from `n`
observations with a prior centred at `μ₀` carrying the weight of `κ` pseudo-observations, the
posterior mean is

```
(n × x̄ + κ × μ₀) / (n + κ)
```

so the evidence is given weight `n / (n + κ)` and the prior keeps `κ / (n + κ)`. This is the
standard result for conjugate models — beta-binomial and normal-normal alike — and is set out in
Gelman et al., *Bayesian Data Analysis*, in the chapters on single-parameter and hierarchical
models. Here `μ₀` is the neutral point (50, "no evidence either way"), which is why the prior term
vanishes from the printed formula and only the `n/(n+1)` factor remains.

### Why `κ = 1` — **Chosen**

`κ` is how many witnesses' worth of ignorance the score starts from. `κ = 1` is the weakest
non-trivial choice: one pseudo-observation of "no evidence", which is the conventional
weakly-informative default for exactly this reason — it is the least the prior can weigh while
still weighing something.

What it buys, and the question it has to survive — *why 1 and not 2?*:

| Effective witnesses | weight | score at full agreement | verdict band |
|---|---|---|---|
| 0 | 0.00 | 50 | NO SIGNAL |
| 0.5 | 0.33 | 67 | LEANS TRUE |
| 1 | 0.50 | 75 | LEANS TRUE |
| 2 | 0.67 | 83 | SUPPORTED |
| 3 | 0.75 | 88 | SUPPORTED |

The property that decides it: **at `κ = 1`, a single independent witness cannot produce a SUPPORTED
verdict at any confidence.** SUPPORTED starts at 80, which needs `weight ≥ 0.6`, which needs
`n ≥ 1.5`. That is the behaviour we wanted from the discount and the reason to stop at 1 rather than
go further.

`κ = 2` is the next value up, and it collapses the top of the scale: it needs `n ≥ 3` to reach 80,
which means three models with *zero* measured evidence overlap and full confidence on both sides of
the mirror probe. Across the 28 stored runs with a measurable agreeing pair, the highest effective
witness count ever observed is 2.08. So at `κ = 2` the SUPPORTED band would be unreachable in
practice and the label would stop meaning anything. `κ = 1` is the smallest value that gets the
guarantee; `κ = 2` is the smallest value that empties the scale.

### `band` — **Definition**

```
band = 50 × (1 − weight) = 50 / (n + 1)
```

The half-width of the credible band is exactly the distance the score was pulled back toward 50 —
the part of the range the evidence did not earn. It introduces no new constant; it is the same
shrinkage read the other way round.

### Verdict labels at 80 / 60 / 40 / 20 — **Chosen**

Equal fifths of the 0–100 scale. Even cuts are the only cuts that express no preference between the
bands, and they are symmetric about 50, so LEANS TRUE and LEANS FALSE are mirror images rather than
one being easier to reach than the other. `NO SIGNAL` is not a band on this scale: it is what is
printed when the Effective Witness Count is 0, regardless of score, because a score built from no
witnesses is not a weak verdict but an absent one.

---

## The Effective Witness Count

```
n = k / (1 + (k − 1) × ρ)
```

### The estimator — **Standard**

Kish's effective sample size under a design effect — the standard correction for observations that
are correlated rather than independent, from Leslie Kish, *Survey Sampling* (1965). It has already
been applied to panels of language models in "Nine Judges, Two Effective Votes: Correlated Errors
Undermine LLM Evaluation Panels" (arXiv:2605.29800), whose abstract states that testing a panel of
9 frontier LLMs from 7 model families, "the 9 judges effectively provide only about 2 independent
votes' worth of information", and which says in as many words that it quantifies this "using the
Kish effective sample size (n_eff)". Both quotations are from the abstract, read.

The estimator is not ours and we do not claim it. What is ours is measuring `ρ` per claim, at query
time, from the models' own stated evidence, rather than assuming a fixed panel-level correlation —
and putting the result in front of the reader as part of the verdict.

`n` is clamped so it can never exceed `k`: below `k = 1` the `(k − 1)` term goes negative and the
raw formula reports *more* effective witnesses than nominal ones, which would inflate confidence
exactly where the panel is weakest.

### `k` — **Definition**

The sum of the agreeing models' discrimination scores. Discrimination is 1, 0.5 or 0 by the
definition below; `k` is their sum and has no parameter of its own.

### Discrimination — 1, 0.5, 0 — **Definition**

Each model is asked the claim, and separately asked its negation, blind, in a fresh request with no
shared context.

- **1 — coherent.** It took opposite positions. Its answer tracks the content of the claim.
- **0 — echo.** It gave the same verdict to both. It is answering the shape of the sentence, so the
  vote carries no information about the fact. Zero is not a penalty; it is the information content.
- **0.5 — partial.** Decisive one way, uncertain the other. Half the evidence of coherence, so half
  the weight. This is the one value in the three that is a convention rather than a derivation, and
  it is the obvious one: the midpoint between "this told us something" and "this told us nothing".
- **0 — unavailable.** The mirror probe never returned, so independence could not be tested. Not
  counted as a witness, and — importantly — reported separately from an echo. An untested model is
  not an accused one.

### `ρ` — measured where possible

The mean pairwise evidence overlap between the agreeing models, from the anchors each named in its
own third probe. Two anchors are the same evidence base when the shorter one's content words are
largely contained in the longer one's; the containment threshold is the one chosen number in the
file and it is dealt with below.

### `ρ = 0.44` when it cannot be measured — **Standard, and labelled on screen**

When a model names no source, its overlap with the others is not observable. Zero would be the
convenient answer and it is the wrong one: it would score a panel that refuses to cite anything as
*maximally independent*, inflating confidence precisely where least is known.

The value is derived rather than picked. Inverting the same estimator on the published figure —
nine judges worth about two independent votes:

```
2 = 9 / (1 + 8ρ)   ⟹   ρ = 0.4375
```

So an unmeasurable pair is treated as about as dependent as the panels in that study. Every place
this prior is used says **assumed**, not measured — on screen, in the witness card, and in what the
adjudicating model is told.

### The anchor match threshold, 0.6 — **Chosen**

This is the one number in the scoring path that is a judgement call, so it gets the longest answer.

Measured over the 243 distinct cross-model anchor pairs in `.runs/`, containment does not separate
into two clean clusters. 169 pairs score below 0.4 and are plainly different evidence; the region
from 0.5 to 0.8 contains pairs that any reader would call the same source. For instance, at 0.57:

> "British Admiralty and Colonial Office records of the 1896 Zanzibar expedition"
> "British Admiralty and Foreign Office records from 1896 (The National Archives, Kew)"

That is one archive, and at 0.6 it is missed.

**So the threshold under-detects, and the direction matters.** A missed match lowers `ρ`, a lower
`ρ` raises the Effective Witness Count, and a higher Effective Witness Count makes the verdict more
confident — which makes this project's entire argument harder to demonstrate, not easier. Sweeping
the threshold over the 28 stored runs that have a measurable agreeing pair:

| threshold | mean ρ | mean effective witnesses |
|---|---|---|
| 0.4 | 0.619 | 1.040 |
| 0.5 | 0.528 | 1.069 |
| **0.6 (in use)** | **0.389** | **1.155** |
| 0.7 | 0.329 | 1.221 |
| 0.8 | 0.222 | 1.292 |

A lower threshold produces a more dramatic headline every time — "three models, one witness" is
easier to reach at 0.4 than at 0.6. We use 0.6. The honest statement is: *this is a heuristic we
chose, it errs toward crediting the panel with more independence than it probably has, and we kept
it there because erring in our own favour would be the one direction we could not defend.*
`test/threshold.test.ts` pins that direction so a later edit cannot quietly tune it back.

The floor of two content words before two anchors may be called the same is part of the same
judgement: below that an anchor is too vague to be evidence of anything, shared or otherwise.

---

## What is *not* in the arithmetic

- No weighting by model, vendor or size. Every model on the panel enters at the same weight, and the
  only things that move its weight are measurements of its own answers.
- No tuning against a labelled set of claims. There is no held-out benchmark here and Quorum does
  not claim accuracy figures it has not measured.
- No term anywhere whose only justification is the shape of the output.
