/**
 * Shapes shared between the verification engine and the UI.
 * Nothing here may import server-only code — client components read these types.
 */

import type { Stance } from "./parse.ts";

export type { Stance };

export type ProbeKind = "direct" | "mirror" | "anchor";

/** One model's answer to one probe. */
export interface ProbeResult {
  kind: ProbeKind;
  modelId: string;
  status: "ok" | "failed";
  /** Present for `direct` and `mirror`. */
  stance?: Stance;
  confidence?: number;
  /** The model's own words for why. */
  reasoning?: string;
  /** Present for `anchor`: the concrete sources the model says it is leaning on. */
  anchors?: string[];
  /** What went wrong, when status is `failed`. Shown to the user, never hidden. */
  error?: string;
  /**
   * The model's chain of thought for this probe, tags removed.
   *
   * Kept for every probe, including failed ones, because it is where the
   * evidence a model found actually lives. The structured answer is a summary
   * the model writes afterwards, and a summary drops things — an evidence base
   * it listed while thinking and then left out of its final three, or, when the
   * token ceiling lands mid-thought, the entire answer.
   */
  thinking?: string;
  /**
   * True when the structured answer was recovered from the model's own draft of
   * it inside its chain of thought, because the answer itself never arrived.
   * Surfaced in the report: a recovered answer is a real answer, but the reader
   * is told which it is.
   */
  recovered?: boolean;
  /** Index into the run's receipt ledger. */
  receiptIndex: number;
}

/** Everything NEFF concluded about one model as a witness. */
export interface WitnessAssessment {
  modelId: string;
  /** Stance on the claim as actually asked. */
  stance: Stance | null;
  confidence: number;
  /** Stance on the negated claim, asked blind in a separate request. */
  mirrorStance: Stance | null;
  /**
   * Does this model distinguish the claim from its negation?
   * 1 = coherent (affirmed one, refuted the other)
   * 0.5 = partial (one side uncertain)
   * 0 = echo (affirmed or refuted both — the vote carries no information)
   */
  discrimination: number;
  discriminationVerdict: "coherent" | "partial" | "echo" | "unavailable";
  anchors: string[];
  /** Mean anchor overlap with the other models that share this stance, 0–1. */
  sharedAnchorRatio: number;
  /** False when that overlap is the documented prior rather than an observation. */
  sharedAnchorMeasured: boolean;
  /** Models this one shares evidence anchors with. */
  echoesWith: string[];
  reachable: boolean;
  note: string;
}

export interface Consensus {
  /** How many reachable models share the majority stance. */
  nominalAgree: number;
  /** How many models answered at all. */
  respondents: number;
  majorityStance: Stance | null;
  /**
   * Effective Witness Count. Kish's effective sample size applied to the panel:
   * k / (1 + (k - 1) * rho), where k is the discrimination-weighted count of
   * agreeing models and rho their mean pairwise evidence-anchor overlap.
   */
  effectiveWitnesses: number;
  /** Mean pairwise anchor overlap inside the agreeing set, 0–1. */
  meanAnchorOverlap: number;
  /**
   * False when at least one pair's overlap could not be measured because a model
   * named no sources, and the documented prior was used instead.
   */
  overlapMeasured: boolean;
  /**
   * Witnesses lost because a model gave the same answer to the claim and to its
   * negation. These are votes that carried no information at all.
   */
  lostToEcho: number;
  /**
   * Witnesses lost because a model could not be tested for consistency at all —
   * its mirror probe never came back. Not an accusation, just a measurement we
   * do not have.
   */
  lostToUnmeasured: number;
  /**
   * Witnesses half-lost because a model was decisive one way and uncertain the
   * other.
   */
  lostToPartial: number;
  /**
   * Witnesses lost because models that agree are leaning on the same evidence.
   * These votes were informative individually but are not independent of
   * each other.
   */
  lostToRedundancy: number;
  /** True when the panel is split rather than agreeing. */
  contested: boolean;
  /** Models on the minority side, when contested. */
  dissenters: string[];
}

/**
 * One finished run, reduced to what a list of past checks needs. Deliberately
 * small: the idle page shows several of these, and a landing page should not be
 * shipping whole probe transcripts to draw six rows.
 */
export interface RunSummary {
  id: string;
  /** What the user actually submitted — a sentence, or a URL. */
  input: string;
  inputKind: "url" | "text";
  /** The single checkable proposition the panel was asked about. */
  claim: string;
  createdAt: number;
  truthScore: number;
  label: VerdictLabel;
  effectiveWitnesses: number;
  nominalAgree: number;
  respondents: number;
}

/** A claim that has been checked more than once, and how its last run went. */
export interface PopularClaim {
  input: string;
  inputKind: "url" | "text";
  claim: string;
  count: number;
  latestId: string;
  latestLabel: VerdictLabel;
  latestScore: number;
}

export interface Verdict {
  /** 0–100, as the brief requires. */
  truthScore: number;
  /**
   * Weighted balance of stances across the panel, -1 (refuted) to +1
   * (supported). Kept on the verdict so the report can show its own arithmetic.
   */
  balance: number;
  /** EWC / (EWC + 1): how much of the way to certainty the evidence can move. */
  shrink: number;
  /** Half-width of the credible band, in truth-score points. */
  band: number;
  label: VerdictLabel;
  /** Plain-language sentence a non-technical reader can act on. */
  headline: string;
}

export type VerdictLabel =
  | "SUPPORTED"
  | "LEANS TRUE"
  | "UNRESOLVED"
  | "LEANS FALSE"
  | "REFUTED"
  | "NO SIGNAL";

export interface Adjudication {
  /** The single fact the verdict rests on. */
  loadBearingFact: string;
  /** What evidence would flip the verdict. */
  falsifier: string;
  /** Why the panel agreed or split, in the adjudicator's words. */
  agreementDiagnosis: string;
  /** The specific point of contention, when the panel is split. */
  contention: string;
}

export interface ClaimPrep {
  /** The checkable proposition NEFF actually verified. */
  claim: string;
  /** Faithful logical negation, used blind in the mirror probe. */
  negation: string;
  /** Why this is the central checkable claim, when input was a URL or long text. */
  rationale: string;
  /** Set when the input was a URL. */
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface ReceiptView {
  requestId: string;
  devshardId: string;
  completionId: string;
  model: string;
  systemFingerprint: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string;
  purpose: string;
  attempts: number;
  status: "ok" | "error";
  error?: string;
  requestBody: string;
  rawResponse: string;
  /** The node's own chain of thought, when it reports one separately. */
  reasoning: string;
  startedAt: number;
}

export interface VerificationRun {
  id: string;
  createdAt: number;
  input: string;
  inputKind: "text" | "url";
  prep: ClaimPrep;
  probes: ProbeResult[];
  witnesses: WitnessAssessment[];
  consensus: Consensus;
  verdict: Verdict;
  adjudication: Adjudication;
  receipts: ReceiptView[];
  totals: { calls: number; failedCalls: number; tokens: number; wallMs: number };
}

/** Server-sent event payloads, in the order the UI receives them. */
export type RunEvent =
  | { type: "stage"; stage: string; detail: string }
  | { type: "prep"; prep: ClaimPrep }
  | { type: "probe"; probe: ProbeResult }
  | { type: "receipt"; receipt: ReceiptView }
  | { type: "done"; run: VerificationRun }
  | { type: "error"; message: string };
