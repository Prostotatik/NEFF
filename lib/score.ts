/**
 * The scoring core: how Quorum turns nine probe answers into a truth score.
 *
 * The whole argument of this project lives in this file. Every other fact
 * checker treats model agreement as evidence and averages it. Agreement between
 * models trained on overlapping corpora is correlated error, so averaging it
 * inflates confidence exactly when the panel is most likely to be wrong
 * together. So Quorum measures two things before it lets a model vote:
 *
 *   1. Does the model distinguish the claim from its own negation? A model that
 *      affirms both is pattern-matching the surface form of the sentence, and
 *      its agreement carries no information. (`discrimination`)
 *   2. Are the models leaning on the same evidence? Three models reading one
 *      page are one witness, not three. (`anchor overlap`)
 *
 * Those two quantities produce the Effective Witness Count, and the truth score
 * is shrunk toward "unresolved" in proportion to how few independent witnesses
 * there actually are.
 *
 * Pure functions only — no I/O — so the maths is unit-testable without Gonka.
 */

import type {
  Consensus,
  ProbeResult,
  Stance,
  Verdict,
  VerdictLabel,
  WitnessAssessment,
} from "./types";

// ---------------------------------------------------------------------------
// Evidence anchors
// ---------------------------------------------------------------------------

const ANCHOR_STOPWORDS = new Set([
  "the", "a", "an", "of", "on", "in", "for", "and", "to", "from", "by", "with", "at", "as",
  "its", "their", "this", "that", "these", "those", "about", "report", "reports", "data",
  "article", "page", "source", "sources", "study", "studies", "general", "knowledge",
  "information", "public", "official", "records", "record", "coverage", "statement",
]);

/**
 * Reduce an anchor to a comparable token set.
 *
 * Models describe the same evidence base in different words — "Cochrane
 * systematic reviews of randomised controlled trials of vitamin C for
 * preventing the common cold" and "Cochrane systematic reviews of randomized
 * placebo-controlled trials of vitamin C supplementation for common cold
 * prevention" are one source, and a comparison that misses that would report an
 * echo as independent corroboration. So spelling variants are folded together
 * and a light suffix stemmer collapses inflections before comparison.
 */
export function anchorTokens(anchor: string): Set<string> {
  return new Set(
    anchor
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .map(stem)
      .filter((t) => t.length > 2 && !ANCHOR_STOPWORDS.has(t)),
  );
}

/** Fold British/American spelling and common inflections onto one form. */
function stem(word: string): string {
  let w = word.replace(/is(e|ed|es|ing|ation)$/, "iz$1");
  w = w
    .replace(/ational$/, "ate")
    .replace(/(iz|is)ation$/, "ize")
    .replace(/ements?$/, "ement")
    .replace(/ing$/, "")
    .replace(/(?<=[a-z]{3})tions?$/, "t")
    .replace(/(?<=[a-z]{3})sions?$/, "s")
    .replace(/(?<=[a-z]{3})ies$/, "y")
    .replace(/(?<=[a-z]{3})es$/, "e")
    .replace(/(?<=[a-z]{3})s$/, "")
    .replace(/(?<=[a-z]{3})ed$/, "");
  return w;
}

/**
 * Two anchors name the same evidence when one's content is largely contained in
 * the other's.
 *
 * Containment rather than Jaccard, because one model routinely describes an
 * evidence base in six words and another in fourteen; set-symmetric similarity
 * would penalise the longer description for being more specific about the very
 * same source.
 */
export const ANCHOR_MATCH_THRESHOLD = 0.6;

export function anchorsMatch(a: string, b: string): boolean {
  const ta = anchorTokens(a);
  const tb = anchorTokens(b);
  // Two content words is the floor for a claim of sameness; below that an
  // anchor is too vague to be evidence of anything, shared or otherwise.
  if (ta.size < 2 || tb.size < 2) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size) >= ANCHOR_MATCH_THRESHOLD;
}

export function anchorOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const used = new Set<number>();
  let matched = 0;
  for (const x of a) {
    for (let j = 0; j < b.length; j++) {
      if (used.has(j)) continue;
      if (anchorsMatch(x, b[j])) {
        used.add(j);
        matched++;
        break;
      }
    }
  }
  return matched / Math.min(a.length, b.length);
}

/**
 * What we assume about two models' evidence overlap when neither would name a
 * source, so it cannot be measured.
 *
 * Zero would be the convenient answer and it is the wrong one: it would score a
 * panel that refuses to cite anything as *maximally independent*, inflating
 * confidence exactly where we know least. The prior used instead is the
 * measured error correlation between frontier language models reported in
 * "How Independent are Large Language Models?" (arXiv:2604.07650), r = 0.77 —
 * models sharing pretraining corpora, distillation ancestry and alignment
 * pipelines are strongly dependent by default, and the burden of proof is on
 * showing independence, not on assuming it.
 *
 * Every place this prior is used is reported to the user as assumed rather than
 * measured. It is never silently mixed in with the measured numbers.
 */
export const ASSUMED_OVERLAP = 0.77;

export interface PairOverlap {
  value: number;
  /** False when the value is the documented prior rather than an observation. */
  measured: boolean;
}

export function pairOverlap(a: string[], b: string[]): PairOverlap {
  if (a.length === 0 || b.length === 0) return { value: ASSUMED_OVERLAP, measured: false };
  return { value: anchorOverlap(a, b), measured: true };
}

// ---------------------------------------------------------------------------
// Witness assessment
// ---------------------------------------------------------------------------

function discriminationOf(
  direct: Stance | null,
  mirror: Stance | null,
): { value: number; verdict: WitnessAssessment["discriminationVerdict"]; note: string } {
  if (!direct || !mirror) {
    return {
      value: 0,
      verdict: "unavailable",
      note: "The mirror probe did not return, so this model's independence could not be measured. It is not counted as a witness.",
    };
  }
  const directional = direct !== "UNCERTAIN" && mirror !== "UNCERTAIN";
  if (directional && direct !== mirror) {
    return {
      value: 1,
      verdict: "coherent",
      note: "Took opposite positions on the claim and its negation, so its answer tracks the content of the claim rather than its phrasing.",
    };
  }
  if (directional && direct === mirror) {
    return {
      value: 0,
      verdict: "echo",
      note: `Returned ${direct} for both the claim and its negation. It is responding to the shape of the sentence, not to the fact, so its vote is discounted to zero.`,
    };
  }
  return {
    value: 0.5,
    verdict: "partial",
    note: "Was decisive on one side and uncertain on the other, so it carries partial weight as a witness.",
  };
}

/**
 * Build one assessment per model from the raw probe results.
 * Models that never answered are returned as unreachable rather than dropped,
 * because a missing witness must be visible in the report.
 */
export function assessWitnesses(modelIds: string[], probes: ProbeResult[]): WitnessAssessment[] {
  const pick = (modelId: string, kind: ProbeResult["kind"]) =>
    probes.find((p) => p.modelId === modelId && p.kind === kind && p.status === "ok");

  const draft = modelIds.map((modelId) => {
    const direct = pick(modelId, "direct");
    const mirror = pick(modelId, "mirror");
    const anchor = pick(modelId, "anchor");
    const stance = direct?.stance ?? null;
    const mirrorStance = mirror?.stance ?? null;
    const { value, verdict, note } = discriminationOf(stance, mirrorStance);

    return {
      modelId,
      stance,
      confidence: direct?.confidence ?? 0,
      mirrorStance,
      discrimination: value,
      discriminationVerdict: verdict,
      anchors: anchor?.anchors ?? [],
      sharedAnchorRatio: 0,
      sharedAnchorMeasured: true as boolean,
      echoesWith: [] as string[],
      reachable: Boolean(direct),
      note: direct
        ? note
        : "This Gonka node did not return a usable answer, so the panel is one witness short.",
    } satisfies WitnessAssessment;
  });

  // Anchor overlap is only meaningful between models that reached the same
  // conclusion: shared evidence behind a shared answer is what inflates
  // confidence. Two models that disagree while citing the same source is a
  // different phenomenon and is reported as contention instead.
  const majority = majorityStance(draft);
  const agreeing = draft.filter((w) => w.stance === majority && w.stance !== null);

  for (const w of agreeing) {
    const others = agreeing.filter((o) => o.modelId !== w.modelId);
    if (others.length === 0) continue;
    const overlaps = others.map((o) => ({ id: o.modelId, ...pairOverlap(w.anchors, o.anchors) }));
    w.sharedAnchorRatio = overlaps.reduce((s, o) => s + o.value, 0) / overlaps.length;
    w.sharedAnchorMeasured = overlaps.every((o) => o.measured);
    w.echoesWith = overlaps
      .filter((o) => o.measured && o.value >= ANCHOR_MATCH_THRESHOLD)
      .map((o) => o.id);
  }

  return draft;
}

function majorityStance(witnesses: WitnessAssessment[]): Stance | null {
  const tally = new Map<Stance, number>();
  for (const w of witnesses) {
    if (!w.stance) continue;
    // Weight the tally by discrimination so an echoing model cannot, on its own,
    // decide which side counts as the majority.
    tally.set(w.stance, (tally.get(w.stance) ?? 0) + 0.01 + w.discrimination);
  }
  let best: Stance | null = null;
  let bestScore = 0;
  for (const [stance, score] of tally) {
    if (score > bestScore) {
      best = stance;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Consensus
// ---------------------------------------------------------------------------

/**
 * Effective Witness Count.
 *
 * Kish's effective sample size for correlated observations:
 *   n_eff = k / (1 + (k - 1) * rho)
 * with k the discrimination-weighted number of agreeing models and rho their
 * mean pairwise evidence overlap. Three models with no shared evidence give 3;
 * three models reading the same page give exactly 1; a panel where every model
 * failed the mirror probe gives 0.
 */
export function effectiveWitnesses(k: number, rho: number): number {
  if (k <= 0) return 0;
  const clamped = Math.min(Math.max(rho, 0), 1);
  return k / (1 + (k - 1) * clamped);
}

export function computeConsensus(witnesses: WitnessAssessment[]): Consensus {
  const respondents = witnesses.filter((w) => w.reachable && w.stance).length;
  const majority = majorityStance(witnesses);
  const agreeing = witnesses.filter((w) => w.stance === majority && w.stance !== null);

  let rho = 0;
  let overlapMeasured = true;
  if (agreeing.length >= 2) {
    const pairs: PairOverlap[] = [];
    for (let i = 0; i < agreeing.length; i++) {
      for (let j = i + 1; j < agreeing.length; j++) {
        pairs.push(pairOverlap(agreeing[i].anchors, agreeing[j].anchors));
      }
    }
    rho = pairs.reduce((s, p) => s + p.value, 0) / pairs.length;
    overlapMeasured = pairs.every((p) => p.measured);
  }

  const k = agreeing.reduce((s, w) => s + w.discrimination, 0);
  const ewc = effectiveWitnesses(k, rho);
  const distinctStances = new Set(witnesses.filter((w) => w.stance).map((w) => w.stance));
  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    nominalAgree: agreeing.length,
    respondents,
    majorityStance: majority,
    effectiveWitnesses: round(ewc),
    lostToEcho: round(agreeing.length - k),
    lostToRedundancy: round(k - ewc),
    meanAnchorOverlap: round(rho),
    overlapMeasured,
    contested: distinctStances.size > 1,
    dissenters: witnesses.filter((w) => w.stance && w.stance !== majority).map((w) => w.modelId),
  };
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const SIGN: Record<Stance, number> = { SUPPORTED: 1, REFUTED: -1, UNCERTAIN: 0 };

/**
 * Truth score on 0–100.
 *
 * Direction comes from the discrimination- and confidence-weighted balance of
 * stances. Magnitude is then shrunk toward 50 by EWC / (EWC + 1): one
 * independent witness can move the score half way to the extreme, three can
 * move it three quarters. Nothing reaches 0 or 100, because a panel of language
 * models is evidence, never proof — and a fact checker that prints "100% true"
 * is lying about what it knows.
 */
export function computeVerdict(witnesses: WitnessAssessment[], consensus: Consensus): Verdict {
  let weighted = 0;
  let weight = 0;
  for (const w of witnesses) {
    if (!w.stance) continue;
    const contribution = w.discrimination * w.confidence;
    weight += contribution;
    weighted += contribution * SIGN[w.stance];
  }
  const balance = weight > 0 ? weighted / weight : 0;

  const ewc = consensus.effectiveWitnesses;
  const shrink = ewc / (ewc + 1);
  const truthScore = Math.round(50 + 50 * balance * shrink);
  const band = Math.round(50 * (1 - shrink));

  const label = labelFor(truthScore, ewc);
  return {
    truthScore,
    balance: Math.round(balance * 100) / 100,
    shrink: Math.round(shrink * 100) / 100,
    band,
    label,
    headline: headlineFor(label, consensus),
  };
}

function labelFor(score: number, ewc: number): VerdictLabel {
  if (ewc <= 0) return "NO SIGNAL";
  if (score >= 80) return "SUPPORTED";
  if (score >= 60) return "LEANS TRUE";
  if (score > 40) return "UNRESOLVED";
  if (score > 20) return "LEANS FALSE";
  return "REFUTED";
}

function headlineFor(label: VerdictLabel, consensus: Consensus): string {
  const { nominalAgree, respondents, effectiveWitnesses: ewc } = consensus;
  const vote = `${nominalAgree}/${respondents}`;

  if (label === "NO SIGNAL") {
    return `The panel produced no usable evidence: ${vote} agreed, but every agreeing model also affirmed the opposite claim, so the agreement carries no information.`;
  }
  if (consensus.contested) {
    return `The panel is split. ${vote} took the leading position, worth ${ewc.toFixed(1)} independent witnesses once the dissent is priced in.`;
  }
  if (nominalAgree >= 2 && ewc < nominalAgree * 0.7) {
    const because = consensus.overlapMeasured
      ? "the agreement is substantially an echo, not corroboration"
      : "at least one of them would not name a source, so its independence has to be assumed rather than measured";
    return `${vote} models agreed, but they are worth ${ewc.toFixed(1)} independent witnesses — ${because}.`;
  }
  return `${vote} models agreed, and the agreement holds up as ${ewc.toFixed(1)} independent witnesses on distinct evidence.`;
}
