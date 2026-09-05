import type { ReactNode } from "react";

import type { Consensus, Verdict } from "@/lib/types";
import s from "./quorum.module.css";

/**
 * Where every number in the score came from. Rendered as a full-width row of the
 * metrics grid when the arithmetic cell is opened.
 *
 * The metrics strip prints `50 + 50 × balance × weight`, and a formula with
 * unexplained coefficients in a fact checker is worth nothing — a reader is
 * entitled to assume any constant they cannot trace was picked to make the
 * output land. So each term is labelled with what kind of number it is:
 *
 *   definition — it follows from the 0–100 scale; there is nothing to tune
 *   standard   — a published estimator, used as published, source named
 *   chosen     — we picked it, and the reasoning is stated, including which way
 *                it errs and what a different value would have done
 *
 * The long form, with the measurements behind the "chosen" entries, is in
 * METHOD.md. This is the version that fits on the page.
 */

type Kind = "definition" | "standard" | "chosen";

const KIND_CLASS: Record<Kind, string> = {
  definition: s.originDefinition,
  standard: s.originStandard,
  chosen: s.originChosen,
};

const KIND_LABEL: Record<Kind, string> = {
  definition: "definition",
  standard: "standard",
  chosen: "chosen",
};

export function ArithmeticPanel({
  verdict,
  consensus,
}: {
  verdict: Verdict;
  consensus: Consensus;
}) {
  const n = consensus.effectiveWitnesses;

  const terms: Array<{ term: string; kind: Kind; body: ReactNode }> = [
    {
      term: "50, and the second 50",
      kind: "definition",
      body: (
        <>
          The brief asks for a score out of 100. On that scale 50 is &ldquo;the evidence points
          neither way&rdquo;, and 50 is the largest excursion that stays inside it. Change either and
          the output stops being a 0–100 score, which is why 40 was never an alternative. The
          consequence is deliberate: since <code>weight</code> is always below 1, no verdict Quorum
          can produce is ever 0 or 100.
        </>
      ),
    },
    {
      term: (
        `balance = ${verdict.balance >= 0 ? "+" : ""}${verdict.balance.toFixed(2)}`
      ),
      kind: "definition",
      body: (
        <>
          The mean of the panel&rsquo;s stance signs (+1 supported, −1 refuted, 0 uncertain),
          weighted by each model&rsquo;s discrimination and its own stated confidence. A weighted
          mean has no free parameter, and both weights are things already measured about that
          model&rsquo;s own answers.
        </>
      ),
    },
    {
      term: `weight = ${n.toFixed(1)} / (${n.toFixed(1)} + 1) = ${verdict.shrink.toFixed(2)}`,
      kind: "standard",
      body: (
        <>
          The shrinkage factor of a conjugate-prior posterior mean: evidence from <code>n</code>{" "}
          observations against a prior worth <code>κ</code> pseudo-observations gets weight{" "}
          <code>n / (n + κ)</code>. Standard for conjugate models — beta-binomial and normal-normal
          alike — and set out in Gelman et al., <em>Bayesian Data Analysis</em>. The prior sits at
          the neutral point, which is why only the factor survives into the formula.
        </>
      ),
    },
    {
      term: "κ = 1",
      kind: "chosen",
      body: (
        <>
          One pseudo-witness of ignorance: the weakest prior that still weighs something. It is set
          there for a property we wanted — <strong>a single independent witness cannot produce a
          SUPPORTED verdict at any confidence</strong>, because 80 needs a weight of 0.6, which needs
          1.5 witnesses. κ = 2 would need 3 effective witnesses to reach 80; the most this build has
          ever measured on a real claim is 2.08, so it would empty the top of the scale instead of
          guarding it.
        </>
      ),
    },
    {
      term: `Effective witnesses = k / (1 + (k − 1) × ρ) = ${n.toFixed(1)}`,
      kind: "standard",
      body: (
        <>
          Kish&rsquo;s effective sample size under a design effect (Kish, <em>Survey Sampling</em>,
          1965), already applied to language-model panels in{" "}
          <a
            href="https://arxiv.org/abs/2605.29800"
            target="_blank"
            rel="noreferrer noopener"
          >
            Nine Judges, Two Effective Votes
          </a>
          , which measures nine judges as worth about two independent votes and quantifies it with
          the same estimator. The estimator is not ours. Measuring ρ per claim, from what these
          models said they were leaning on, is.
        </>
      ),
    },
    {
      term: `ρ = ${consensus.meanAnchorOverlap.toFixed(2)}${consensus.overlapMeasured ? " (measured)" : " (assumed)"}`,
      kind: consensus.overlapMeasured ? "definition" : "standard",
      body: consensus.overlapMeasured ? (
        <>
          The mean pairwise overlap in the evidence the agreeing models named, measured from this
          run&rsquo;s own third probe.
        </>
      ) : (
        <>
          At least one agreeing model named no source, so its overlap is not observable. Zero would
          score a panel that cites nothing as maximally independent, so the documented prior is used
          instead: inverting the same estimator on the published nine-judges figure,{" "}
          <code>2 = 9 / (1 + 8ρ)</code> gives ρ = 0.4375. Every use of it is labelled assumed, here
          and in what the adjudicating model was told.
        </>
      ),
    },
    {
      term: "anchor match at 0.6 containment",
      kind: "chosen",
      body: (
        <>
          The one judgement call in the scoring path. Across every cross-model anchor pair this
          build has stored, containment does not split into clean clusters, and 0.6 misses real
          matches — two descriptions of the same Admiralty archive score 0.57. That error runs
          against us: a missed match lowers ρ, which <em>raises</em> the effective witness count and
          makes the verdict more confident. Sweeping the threshold across the stored runs, a looser
          value raises the mean evidence overlap and lowers the mean effective witness count every
          time — it tells this project&rsquo;s story better, and it is not the one in use.{" "}
          <code>npm run sweep:threshold</code> prints the current figures from the runs on disk; they
          move as the corpus grows, which is why they are not quoted here as though they were fixed.
        </>
      ),
    },
    {
      term: `band = ±${verdict.band}`,
      kind: "definition",
      body: (
        <>
          Exactly how far the score was pulled back toward 50: <code>50 × (1 − weight)</code>, the
          part of the range this evidence did not earn. No new constant — the same shrinkage read
          the other way round.
        </>
      ),
    },
  ];

  const count = (kind: Kind) => terms.filter((t) => t.kind === kind).length;

  return (
    <div className={s.arithmetic}>
      <p className={s.arithmeticLead}>
        Every constant in the formula above, with what kind of number it is. {count("definition")}{" "}
        follow from the 0–100 scale and have nothing to tune, {count("standard")} are published
        estimators used as published with the source named, and {count("chosen")} we chose — those
        say which way they err and what a different value would have done to the figure above.{" "}
        <span className={s.arithmeticDim}>The long form, with the measurements, is in METHOD.md.</span>
      </p>

      <dl className={s.arithmeticList}>
        {terms.map((t) => (
          <div key={t.term} className={s.arithmeticRow}>
            <dt className={s.arithmeticTerm}>
              <code className={s.arithmeticCode}>{t.term}</code>
              <span className={`${s.originTag} ${KIND_CLASS[t.kind]}`}>{KIND_LABEL[t.kind]}</span>
            </dt>
            <dd className={s.arithmeticBody}>{t.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
