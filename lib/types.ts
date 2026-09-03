/**
 * Shapes shared between the verification engine and the UI.
 * Nothing here may import server-only code — client components read these types.
 */

import type { Stance } from "./parse";

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
  /** Index into the run's receipt ledger. */
  receiptIndex: number;
}

/** Everything Quorum concluded about one model as a witness. */
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
  /** True when the panel is split rather than agreeing. */
  contested: boolean;
  /** Models on the minority side, when contested. */
  dissenters: string[];
}

export interface Verdict {
  /** 0–100, as the brief requires. */
  truthScore: number;
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
  /** The checkable proposition Quorum actually verified. */
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
