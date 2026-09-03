/**
 * The verification engine.
 *
 * One run = 11 inferences on the Gonka Network:
 *   1  claim preparation   — reduce the input to one checkable claim + its negation
 *   9  probes              — 3 models x {direct, mirror, anchor}
 *   1  adjudication        — what the verdict hinges on, and what would flip it
 *
 * The nine probes are fired concurrently and streamed to the UI as each Gonka
 * node answers. That is not only for speed: watching independent nodes land at
 * different moments is what makes the decentralisation legible to a judge
 * instead of being a claim in a README.
 */

import "server-only";

import { GonkaError, gonkaChat, type GonkaReceipt } from "./gonka";
import { ADJUDICATOR, PANEL, labelFor } from "./models";
import { fetchPage, looksLikeUrl } from "./extract";
import {
  normaliseConfidence,
  normaliseStance,
  parseJsonObject,
  stringList,
  textField,
} from "./parse";
import { adjudicationPrompt, anchorPrompt, directPrompt, mirrorPrompt, prepPrompt } from "./prompts";
import { assessWitnesses, computeConsensus, computeVerdict } from "./score";
import type {
  Adjudication,
  ClaimPrep,
  ProbeKind,
  ProbeResult,
  ReceiptView,
  RunEvent,
  VerificationRun,
  WitnessAssessment,
} from "./types";

export const CALLS_PER_RUN = 1 + PANEL.length * 3 + 1;

function toView(receipt: GonkaReceipt): ReceiptView {
  return {
    requestId: receipt.requestId,
    devshardId: receipt.devshardId,
    completionId: receipt.completionId,
    model: receipt.model,
    systemFingerprint: receipt.systemFingerprint,
    latencyMs: receipt.latencyMs,
    promptTokens: receipt.promptTokens,
    completionTokens: receipt.completionTokens,
    totalTokens: receipt.totalTokens,
    finishReason: receipt.finishReason,
    purpose: receipt.purpose,
    attempts: receipt.attempts,
    status: receipt.status,
    error: receipt.error,
    requestBody: JSON.stringify(receipt.request, null, 2),
    rawResponse: receipt.rawResponse,
    reasoning: receipt.reasoning,
    startedAt: receipt.startedAt,
  };
}

/**
 * How many probes may be in flight against the router at once.
 *
 * Measured: firing all nine at once earns 429s and Cloudflare 524s, and a probe
 * lost to queueing costs the panel a witness for reasons that have nothing to do
 * with the claim. Four keeps the burst under the gateway's limit while still
 * overlapping the slow models with the fast ones.
 */
const MAX_IN_FLIGHT = 4;

/** Admission control for outbound Gonka calls. */
function createGate(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function gate<T>(job: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await job();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

/** Yield results in completion order rather than argument order. */
async function* asCompleted<T>(promises: Promise<T>[]): AsyncGenerator<T> {
  const pending = new Map<number, Promise<{ index: number; value: T }>>();
  promises.forEach((p, index) => pending.set(index, p.then((value) => ({ index, value }))));
  while (pending.size > 0) {
    const { index, value } = await Promise.race(pending.values());
    pending.delete(index);
    yield value;
  }
}

interface ProbeOutcome {
  probe: Omit<ProbeResult, "receiptIndex">;
  receipt: GonkaReceipt;
}

async function runProbe(
  kind: ProbeKind,
  model: (typeof PANEL)[number],
  claim: string,
  negation: string,
): Promise<ProbeOutcome> {
  const messages =
    kind === "direct" ? directPrompt(claim) : kind === "mirror" ? mirrorPrompt(negation) : anchorPrompt(claim);

  try {
    const { text, receipt } = await gonkaChat({
      model: model.id,
      messages,
      purpose: kind,
      maxTokens: model.maxTokens,
      timeoutMs: model.timeoutMs,
      chatTemplateKwargs: model.chatTemplateKwargs,
    });

    const parsed = parseJsonObject<Record<string, unknown>>(text);
    if (!parsed) {
      return {
        probe: {
          kind,
          modelId: model.id,
          status: "failed",
          error: "The node replied, but not with a structured answer this probe could read.",
        },
        receipt,
      };
    }

    if (kind === "anchor") {
      const anchors = stringList(parsed.anchors, 3);
      return { probe: { kind, modelId: model.id, status: "ok", anchors }, receipt };
    }

    const stance = normaliseStance(parsed.stance);
    const confidence = normaliseConfidence(parsed.confidence);
    if (!stance || confidence === null) {
      return {
        probe: {
          kind,
          modelId: model.id,
          status: "failed",
          error: "The node answered without a readable stance or confidence.",
        },
        receipt,
      };
    }

    const reasoning = textField(parsed.reasoning);
    const evidence = textField(parsed.key_evidence, 300);
    return {
      probe: {
        kind,
        modelId: model.id,
        status: "ok",
        stance,
        confidence,
        reasoning: evidence ? `${reasoning}\n\nDecisive evidence: ${evidence}` : reasoning,
      },
      receipt,
    };
  } catch (error) {
    const gonkaError = error instanceof GonkaError ? error : null;
    const message = gonkaError?.message ?? "This Gonka node could not be reached.";
    return {
      probe: { kind, modelId: model.id, status: "failed", error: message },
      receipt:
        gonkaError?.receipt ??
        ({
          requestId: "",
          devshardId: "",
          completionId: "",
          model: model.id,
          systemFingerprint: "",
          latencyMs: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          finishReason: "",
          purpose: kind,
          attempts: 1,
          request: {
            model: model.id,
            temperature: 0,
            max_tokens: model.maxTokens,
            messages,
            ...(model.chatTemplateKwargs ? { chat_template_kwargs: model.chatTemplateKwargs } : {}),
          },
          rawResponse: "",
          reasoning: "",
          status: "error",
          error: message,
          startedAt: Date.now(),
        } satisfies GonkaReceipt),
    };
  }
}

function panelSummary(witnesses: WitnessAssessment[], probes: ProbeResult[]): string {
  return witnesses
    .map((w) => {
      if (!w.reachable) return `- ${labelFor(w.modelId)}: did not answer.`;
      const direct = probes.find((p) => p.modelId === w.modelId && p.kind === "direct");
      const reason = direct?.reasoning?.replace(/\s+/g, " ").slice(0, 400) ?? "";
      const anchors = w.anchors.length ? w.anchors.join("; ") : "named no specific source";
      return `- ${labelFor(w.modelId)}: ${w.stance} at confidence ${w.confidence}. Reasoning: ${reason} Evidence it leaned on: ${anchors}.`;
    })
    .join("\n");
}

function independenceSummary(
  witnesses: WitnessAssessment[],
  consensus: ReturnType<typeof computeConsensus>,
): string {
  const lines = witnesses
    .filter((w) => w.reachable)
    .map((w) => {
      const mirror =
        w.discriminationVerdict === "echo"
          ? `gave the same answer (${w.stance}) to the claim AND to its negation, so its vote carries no information`
          : w.discriminationVerdict === "coherent"
            ? `answered the claim and its negation in opposite directions, so it is tracking the fact`
            : w.discriminationVerdict === "partial"
              ? `was decisive one way and uncertain the other`
              : `could not be tested for consistency`;
      return `- ${labelFor(w.modelId)} ${mirror}. Evidence overlap with the models that agree with it: ${Math.round(w.sharedAnchorRatio * 100)}%.`;
    });

  return [
    `Nominal agreement: ${consensus.nominalAgree} of ${consensus.respondents} models that answered.`,
    `Mean evidence overlap inside that agreeing group: ${Math.round(consensus.meanAnchorOverlap * 100)}%.`,
    `Effective Witness Count after discounting echoes and shared evidence: ${consensus.effectiveWitnesses}.`,
    ...lines,
  ].join("\n");
}

/**
 * Run a full verification, yielding events as they happen.
 * Never throws for an individual model failure — a lost node degrades the
 * Effective Witness Count and is reported, rather than ending the run.
 */
export async function* verify(input: string): AsyncGenerator<RunEvent, void, void> {
  const startedAt = Date.now();
  const receipts: ReceiptView[] = [];
  const probes: ProbeResult[] = [];

  const pushReceipt = (receipt: GonkaReceipt): number => {
    receipts.push(toView(receipt));
    return receipts.length - 1;
  };

  const isUrl = looksLikeUrl(input);

  // --- 1. claim preparation ------------------------------------------------
  yield {
    type: "stage",
    stage: "prep",
    detail: isUrl ? "Fetching the page and isolating the checkable claim" : "Isolating the checkable claim",
  };

  let pageText: string | undefined;
  let sourceTitle: string | undefined;
  if (isUrl) {
    try {
      const page = await fetchPage(input);
      pageText = page.text;
      sourceTitle = page.title;
    } catch (error) {
      yield { type: "error", message: error instanceof Error ? error.message : "That URL could not be read." };
      return;
    }
  }

  let prep: ClaimPrep;
  try {
    const { text, receipt } = await gonkaChat({
      model: ADJUDICATOR.id,
      messages: prepPrompt(input, isUrl, pageText),
      purpose: "prep",
      maxTokens: 900,
      timeoutMs: ADJUDICATOR.timeoutMs,
    });
    const receiptIndex = pushReceipt(receipt);
    yield { type: "receipt", receipt: receipts[receiptIndex] };

    const parsed = parseJsonObject<Record<string, unknown>>(text);
    const claim = textField(parsed?.claim, 500);
    const negation = textField(parsed?.negation, 500);
    if (!claim || !negation) {
      yield {
        type: "error",
        message:
          "The Gonka node could not reduce that input to a single checkable claim. Try pasting one specific factual assertion.",
      };
      return;
    }
    prep = {
      claim,
      negation,
      rationale: textField(parsed?.rationale, 300),
      sourceUrl: isUrl ? input.trim() : undefined,
      sourceTitle: sourceTitle || textField(parsed?.title, 200) || undefined,
    };
  } catch (error) {
    const message = error instanceof GonkaError ? error.message : "The Gonka Router could not be reached.";
    if (error instanceof GonkaError) {
      const receiptIndex = pushReceipt(error.receipt);
      yield { type: "receipt", receipt: receipts[receiptIndex] };
    }
    yield { type: "error", message };
    return;
  }

  yield { type: "prep", prep };

  // --- 2. the probe battery ------------------------------------------------
  yield {
    type: "stage",
    stage: "probe",
    detail: `Probing ${PANEL.length} models three ways each, in parallel across Gonka nodes`,
  };

  const gate = createGate(MAX_IN_FLIGHT);
  // Slowest models first: their probes are what the wall clock is waiting on, so
  // they should be the first through the gate, not the last.
  const order = [...PANEL].sort((a, b) => b.timeoutMs - a.timeoutMs);
  const jobs: Promise<ProbeOutcome>[] = [];
  for (const kind of ["direct", "mirror", "anchor"] as const) {
    for (const model of order) {
      jobs.push(gate(() => runProbe(kind, model, prep.claim, prep.negation)));
    }
  }

  for await (const outcome of asCompleted(jobs)) {
    const receiptIndex = pushReceipt(outcome.receipt);
    const probe: ProbeResult = { ...outcome.probe, receiptIndex };
    probes.push(probe);
    yield { type: "receipt", receipt: receipts[receiptIndex] };
    yield { type: "probe", probe };
  }

  // --- 3. the maths --------------------------------------------------------
  yield { type: "stage", stage: "score", detail: "Measuring how independent those answers actually were" };

  const witnesses = assessWitnesses(
    PANEL.map((m) => m.id),
    probes,
  );
  const consensus = computeConsensus(witnesses);
  const verdict = computeVerdict(witnesses, consensus);

  // --- 4. adjudication -----------------------------------------------------
  yield { type: "stage", stage: "adjudicate", detail: "Writing what the verdict hinges on" };

  let adjudication: Adjudication = {
    loadBearingFact: "",
    falsifier: "",
    agreementDiagnosis: "",
    contention: "",
  };

  try {
    const { text, receipt } = await gonkaChat({
      model: ADJUDICATOR.id,
      messages: adjudicationPrompt(
        prep.claim,
        prep.negation,
        panelSummary(witnesses, probes),
        independenceSummary(witnesses, consensus),
      ),
      purpose: "adjudicate",
      maxTokens: 900,
      timeoutMs: ADJUDICATOR.timeoutMs,
    });
    const receiptIndex = pushReceipt(receipt);
    yield { type: "receipt", receipt: receipts[receiptIndex] };

    const parsed = parseJsonObject<Record<string, unknown>>(text);
    adjudication = {
      loadBearingFact: textField(parsed?.load_bearing_fact, 400),
      falsifier: textField(parsed?.falsifier, 400),
      agreementDiagnosis: textField(parsed?.agreement_diagnosis, 600),
      contention: textField(parsed?.contention, 400),
    };
  } catch (error) {
    if (error instanceof GonkaError) {
      const receiptIndex = pushReceipt(error.receipt);
      yield { type: "receipt", receipt: receipts[receiptIndex] };
    }
    // The verdict and its independence measurement do not depend on this call.
    // Say the closing note is missing rather than inventing one.
    adjudication.agreementDiagnosis =
      "The closing note could not be produced: that Gonka node did not answer. The verdict, the probe transcript and the independence measurement above are unaffected.";
  }

  const run: VerificationRun = {
    id: newRunId(),
    createdAt: startedAt,
    input,
    inputKind: isUrl ? "url" : "text",
    prep,
    probes,
    witnesses,
    consensus,
    verdict,
    adjudication,
    receipts,
    totals: {
      calls: receipts.length,
      failedCalls: receipts.filter((r) => r.status === "error").length,
      tokens: receipts.reduce((sum, r) => sum + r.totalTokens, 0),
      wallMs: Date.now() - startedAt,
    },
  };

  yield { type: "done", run };
}

function newRunId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 10; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}
