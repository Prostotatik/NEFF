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
import { randomBytes } from "node:crypto";

import { GonkaError, gonkaChat, type GonkaReceipt } from "./gonka.ts";
import { ADJUDICATOR, CLOSING_ORDER, PANEL, labelFor } from "./models.ts";
import { fetchPage, looksLikeUrl } from "./extract.ts";
import {
  extractThinking,
  normaliseConfidence,
  normaliseStance,
  parseAnswer,
  parseJsonObject,
  stringList,
  textField,
} from "./parse.ts";
import { adjudicationPrompt, anchorPrompt, directPrompt, mirrorPrompt, prepPrompt } from "./prompts.ts";
import { assessWitnesses, computeConsensus, computeVerdict } from "./score.ts";
import type {
  Adjudication,
  ClaimPrep,
  ProbeKind,
  ProbeResult,
  ReceiptView,
  RunEvent,
  VerificationRun,
  WitnessAssessment,
} from "./types.ts";

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
 * with the claim. Six is two waves rather than three — worth about a third of the
 * probe phase on a congested router — and stayed under the gateway's limit in
 * testing, with retry and backoff still behind it if that stops being true.
 */
const MAX_IN_FLIGHT = 6;

/**
 * Hard ceiling on the whole probe phase.
 *
 * A verification is a live demo, not a batch job. One node hanging must not hold
 * the report open indefinitely, so a probe still waiting when the budget runs out
 * is cut and reported as unreachable — which costs the panel a witness, visibly,
 * rather than costing the user the verdict.
 */
const PROBE_PHASE_BUDGET_MS = 50_000;

/**
 * Ceiling on claim preparation, which is a single point of failure at the front
 * of every run: three attempts at the model's full timeout could spend more than
 * two minutes before a single probe was fired.
 */
const PREP_TIMEOUT_MS = 18_000;
const PREP_FIRST_ATTEMPT_MS = 12_000;
const PREP_ATTEMPTS = 3;
/** Ceiling on the whole preparation phase, retries included: 12 + 12 + 18. */
const PREP_BUDGET_MS = 42_000;

/**
 * Ceiling on the whole closing-note phase, failover included. Any one node gets
 * a short leash; the phase as a whole gets a shorter one than three leashes
 * would add up to, because by this point the verdict is already decided and the
 * reader is waiting on prose.
 */
const ADJUDICATION_BUDGET_MS = 44_000;

/**
 * Per-node leash inside that phase, one send each, then the next node.
 *
 * The probe phase gets a short leash and a retry, because a cut-off probe leaves
 * the router holding a finished completion that the re-send is answered from in
 * seconds. That does not transfer here, and it was tried: at 14s with two sends
 * per node, both sends timed out on three runs out of four and the closing note
 * went missing. The difference is that the closing note is a long generation
 * from a prompt no other request shares, so there is nothing warm to come back
 * to — it simply needs the time. Twenty seconds covers MiniMax's measured 7.1s,
 * 7.8s and 11.7s with margin, and the phase budget still fits two nodes.
 */
const ADJUDICATION_ATTEMPT_MS = 20_000;

/**
 * Token ceiling for the closing note specifically.
 *
 * It used to be the model's own probe budget, which for MiniMax is 3200 — far
 * more room than four short prose fields need, and a reasoning model will use
 * whatever it is given. Measured on cold adjudication calls: 557, 727 and 1247
 * completion tokens, so 1600 leaves headroom over the worst observed while
 * capping the tail that was costing the phase its budget.
 */
const ADJUDICATION_MAX_TOKENS = 1_600;

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
      // Always release the next waiter, including when the job threw — otherwise
      // one failure strands every probe still queued behind it.
      queue.shift()?.();
    }
  };
}

/**
 * Yield results in completion order rather than argument order.
 *
 * A rejection is isolated to its own slot: one failed probe must never discard
 * the probes that already landed. `runProbe` catches everything today, so this
 * is belt and braces on the invariant that a lost node costs a witness, not the
 * verification.
 */
async function* asCompleted<T>(promises: Promise<T>[]): AsyncGenerator<T> {
  type Settled = { index: number; value: T; failed: false } | { index: number; failed: true };
  const pending = new Map<number, Promise<Settled>>();
  promises.forEach((p, index) =>
    pending.set(
      index,
      p.then(
        (value) => ({ index, value, failed: false as const }),
        () => ({ index, failed: true as const }),
      ),
    ),
  );
  while (pending.size > 0) {
    const settled = await Promise.race(pending.values());
    pending.delete(settled.index);
    if (!settled.failed) yield settled.value;
  }
}

interface ProbeOutcome {
  probe: Omit<ProbeResult, "receiptIndex">;
  receipt: GonkaReceipt;
}

/**
 * One probe against one model. Exported so a live test can drive the real path
 * with a deliberately small token budget, which is the only honest way to
 * exercise the draft-recovery branch — the failure it handles is rare, and a
 * branch nobody has ever run is not a fix.
 */
export async function runProbe(
  kind: ProbeKind,
  model: (typeof PANEL)[number],
  claim: string,
  negation: string,
  deadline: number,
  signal?: AbortSignal,
): Promise<ProbeOutcome> {
  const messages =
    kind === "direct" ? directPrompt(claim) : kind === "mirror" ? mirrorPrompt(negation) : anchorPrompt(claim);
  // Whichever runs out first: this model's own ceiling, or what is left of the
  // phase budget for a probe that waited its turn at the gate.
  const timeoutMs = Math.max(5_000, Math.min(model.timeoutMs, deadline - Date.now()));

  try {
    const { text, receipt } = await gonkaChat({
      model: model.id,
      messages,
      purpose: kind,
      maxTokens: model.maxTokens,
      timeoutMs,
      firstAttemptMs: model.firstAttemptMs,
      // Retries share the phase budget rather than extending it, so a probe that
      // is asked twice still cannot hold the report open past the deadline.
      deadline,
      chatTemplateKwargs: model.chatTemplateKwargs,
      signal,
    });

    // The model's own working, kept whatever happens to the structured answer.
    // It is the only copy of anything the answer summarised away.
    const thinking = extractThinking(text) || receipt.reasoning || "";
    const parsed = parseAnswer<Record<string, unknown>>(
      text,
      kind === "anchor" ? "anchors" : "stance",
    );
    if (!parsed) {
      return {
        probe: {
          kind,
          modelId: model.id,
          status: "failed",
          error: "The node replied, but not with a structured answer this probe could read.",
          // Failed for scoring, but the node did say something, and what it said
          // is evidence the reader is entitled to. Showing an error where prose
          // exists is the difference between "this node was silent" and "this
          // node reasoned and we threw it away".
          thinking: thinking.slice(0, 4000),
        },
        receipt,
      };
    }
    const recovered = parsed.origin === "draft";

    if (kind === "anchor") {
      const anchors = stringList(parsed.value.anchors, 3);
      return {
        probe: {
          kind,
          modelId: model.id,
          status: "ok",
          anchors,
          recovered,
          thinking: thinking.slice(0, 4000),
        },
        receipt,
      };
    }

    const stance = normaliseStance(parsed.value.stance);
    const confidence = normaliseConfidence(parsed.value.confidence);
    if (!stance || confidence === null) {
      return {
        probe: {
          kind,
          modelId: model.id,
          status: "failed",
          error: "The node answered without a readable stance or confidence.",
          thinking: thinking.slice(0, 4000),
        },
        receipt,
      };
    }

    const reasoning = textField(parsed.value.reasoning);
    const evidence = textField(parsed.value.key_evidence, 300);
    return {
      probe: {
        kind,
        modelId: model.id,
        status: "ok",
        stance,
        confidence,
        reasoning: evidence ? `${reasoning}\n\nDecisive evidence: ${evidence}` : reasoning,
        recovered,
        thinking: thinking.slice(0, 4000),
      },
      receipt,
    };
  } catch (error) {
    const gonkaError = error instanceof GonkaError ? error : null;
    const message = gonkaError?.message ?? "This Gonka node could not be reached.";

    // Last chance to save a probe the router charged for.
    //
    // `gonkaChat` treats a response that is nothing but an unterminated <think>
    // block as no answer, which is right — it retries it with a bigger budget,
    // and usually that is enough. But when the last retry runs out too, the text
    // it gives up on is exactly the text most likely to contain the model's own
    // draft of the answer, written before the ceiling landed. Throwing that away
    // would discard evidence the model actually produced, which is the bug this
    // whole path exists to fix, so the salvage runs here rather than not at all.
    const salvage = gonkaError?.receipt.rawResponse
      ? parseAnswer<Record<string, unknown>>(
          gonkaError.receipt.rawResponse,
          kind === "anchor" ? "anchors" : "stance",
        )
      : null;
    if (salvage?.origin === "draft") {
      const thinking = extractThinking(gonkaError!.receipt.rawResponse).slice(0, 4000);
      if (kind === "anchor") {
        return {
          probe: {
            kind,
            modelId: model.id,
            status: "ok",
            anchors: stringList(salvage.value.anchors, 3),
            recovered: true,
            thinking,
          },
          receipt: gonkaError!.receipt,
        };
      }
      const stance = normaliseStance(salvage.value.stance);
      const confidence = normaliseConfidence(salvage.value.confidence);
      if (stance && confidence !== null) {
        const reasoning = textField(salvage.value.reasoning);
        const evidence = textField(salvage.value.key_evidence, 300);
        return {
          probe: {
            kind,
            modelId: model.id,
            status: "ok",
            stance,
            confidence,
            reasoning: evidence ? `${reasoning}\n\nDecisive evidence: ${evidence}` : reasoning,
            recovered: true,
            thinking,
          },
          receipt: gonkaError!.receipt,
        };
      }
    }

    return {
      probe: {
        kind,
        modelId: model.id,
        status: "failed",
        error: message,
        thinking: gonkaError?.receipt.rawResponse
          ? extractThinking(gonkaError.receipt.rawResponse).slice(0, 4000)
          : undefined,
      },
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

export function panelSummary(witnesses: WitnessAssessment[], probes: ProbeResult[]): string {
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

export function independenceSummary(
  witnesses: WitnessAssessment[],
  consensus: ReturnType<typeof computeConsensus>,
): string {
  // The adjudicator writes prose that ends up in front of the reader, so it must
  // never be handed a number the reader would see flagged. Two traps: a witness
  // whose overlap was never computed has sharedAnchorRatio 0, which reads as
  // "no overlap", and an overlap filled in from the documented prior is not an
  // observation. Both are labelled here, or omitted.
  const lines = witnesses
    .filter((w) => w.reachable)
    .map((w) => {
      const mirror =
        w.discriminationVerdict === "echo"
          ? `gave the same answer (${w.stance}) to the claim AND to its negation, so its vote carries no information`
          : w.discriminationVerdict === "coherent"
            ? "answered the claim and its negation in opposite directions, so it is tracking the fact"
            : w.discriminationVerdict === "partial"
              ? "was decisive one way and uncertain the other"
              : "could not be tested for consistency";

      const agreesWithOthers =
        w.stance === consensus.majorityStance && consensus.nominalAgree > 1;
      const overlap = !agreesWithOthers
        ? "It does not sit inside the agreeing group, so evidence overlap does not apply to it."
        : w.sharedAnchorMeasured
          ? `Measured evidence overlap with the models that agree with it: ${Math.round(w.sharedAnchorRatio * 100)}%.`
          : `Its evidence overlap could not be measured because a model named no source; ${Math.round(w.sharedAnchorRatio * 100)}% is an assumed default, not an observation.`;

      return `- ${labelFor(w.modelId)} ${mirror}. ${overlap}`;
    });

  const rho = consensus.nominalAgree > 1
    ? consensus.overlapMeasured
      ? `Mean measured evidence overlap inside that agreeing group: ${Math.round(consensus.meanAnchorOverlap * 100)}%.`
      : `Evidence overlap inside that agreeing group could not be fully measured, because at least one model named no source. ${Math.round(consensus.meanAnchorOverlap * 100)}% is an assumed default and must be described as an assumption, never as an observation.`
    : "Only one model holds the leading position, so there is no overlap to measure.";

  return [
    `Nominal agreement: ${consensus.nominalAgree} of ${consensus.respondents} models that answered.`,
    rho,
    `Effective Witness Count after discounting echoes and shared evidence: ${consensus.effectiveWitnesses}.`,
    ...lines,
  ].join("\n");
}

/**
 * Run a full verification, yielding events as they happen.
 * Never throws for an individual model failure — a lost node degrades the
 * Effective Witness Count and is reported, rather than ending the run.
 */
export async function* verify(
  input: string,
  signal?: AbortSignal,
): AsyncGenerator<RunEvent, void, void> {
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
      timeoutMs: PREP_TIMEOUT_MS,
      firstAttemptMs: PREP_FIRST_ATTEMPT_MS,
      deadline: Date.now() + PREP_BUDGET_MS,
      maxAttempts: PREP_ATTEMPTS,
      signal,
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
  const deadline = Date.now() + PROBE_PHASE_BUDGET_MS;
  // Slowest models first: their probes are what the wall clock is waiting on, so
  // they should be the first through the gate, not the last.
  const order = [...PANEL].sort((a, b) => b.timeoutMs - a.timeoutMs);
  const jobs: Promise<ProbeOutcome>[] = [];
  for (const kind of ["direct", "mirror", "anchor"] as const) {
    for (const model of order) {
      jobs.push(gate(() => runProbe(kind, model, prep.claim, prep.negation, deadline, signal)));
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

  const messages = adjudicationPrompt(
    prep.claim,
    prep.negation,
    panelSummary(witnesses, probes),
    independenceSummary(witnesses, consensus),
  );

  // The closing note is the most-read part of the report, and losing one node
  // should not blank three cells of it. If the first node does not answer, the
  // next model on the panel writes it — every one of them is on the Gonka
  // Network, so failing over changes nothing about where the reasoning happens.
  // The order is measured, not the panel order: see CLOSING_ORDER.
  const adjudicators = CLOSING_ORDER;
  const adjudicationDeadline = Date.now() + ADJUDICATION_BUDGET_MS;

  for (const model of adjudicators) {
    if (signal?.aborted) break;
    const remaining = adjudicationDeadline - Date.now();
    if (remaining < 5_000) break;
    try {
      const { text, receipt } = await gonkaChat({
        model: model.id,
        messages,
        purpose: "adjudicate",
        maxTokens: ADJUDICATION_MAX_TOKENS,
        // One send per node, then the next node. See ADJUDICATION_ATTEMPT_MS for
        // why this phase does not get the probe phase's retry: there is nothing
        // warm to retry into when the prompt is unique to this run.
        timeoutMs: Math.min(model.timeoutMs, ADJUDICATION_ATTEMPT_MS, remaining),
        deadline: adjudicationDeadline,
        chatTemplateKwargs: model.chatTemplateKwargs,
        maxAttempts: 1,
        signal,
      });
      const receiptIndex = pushReceipt(receipt);
      yield { type: "receipt", receipt: receipts[receiptIndex] };

      const parsed = parseJsonObject<Record<string, unknown>>(text);
      const candidate: Adjudication = {
        loadBearingFact: textField(parsed?.load_bearing_fact, 400),
        falsifier: textField(parsed?.falsifier, 400),
        agreementDiagnosis: textField(parsed?.agreement_diagnosis, 600),
        contention: textField(parsed?.contention, 400),
      };
      // An answer that came back unreadable is not an answer; try the next node
      // rather than showing the reader three empty cells.
      if (candidate.loadBearingFact || candidate.falsifier || candidate.agreementDiagnosis) {
        adjudication = candidate;
        break;
      }
    } catch (error) {
      if (error instanceof GonkaError) {
        const receiptIndex = pushReceipt(error.receipt);
        yield { type: "receipt", receipt: receipts[receiptIndex] };
      }
    }
  }

  if (!adjudication.loadBearingFact && !adjudication.agreementDiagnosis) {
    // The verdict and its independence measurement do not depend on this call.
    // Say the closing note is missing rather than inventing one.
    adjudication.agreementDiagnosis =
      "The closing note could not be produced: no node on the panel returned one. The verdict, the probe transcript and the independence measurement above are unaffected — they come from the probes, not from this step.";
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

/**
 * Report ids address unauthenticated pages that echo whatever the user pasted.
 * `Math.random()` is a predictable PRNG whose state can be recovered from a
 * handful of outputs, so ids are drawn from the system CSPRNG instead.
 *
 * Note what this does and does not buy since the idle page started listing past
 * checks: an id is still not guessable, but the newest ones are now published on
 * the landing page by design, and `GET /api/history` will hand them to anyone.
 * That is deliberate — a shared instance showing what it has been asked is the
 * feature — and the idle panel says so in as many words rather than leaving a
 * reader to assume a link they were never given is private.
 */
function newRunId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let id = "";
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return id;
}
