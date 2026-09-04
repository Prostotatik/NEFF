import { labelFor, modelByHouse } from "@/lib/models";
import type { Stance, VerdictLabel, VerificationRun, WitnessAssessment } from "@/lib/types";
import { ReceiptLedger } from "./ReceiptLedger";
import { Balance, Icosahedron, Ridge, Spiral } from "./Orbs";
import {
  CheckCircle,
  DocIcon,
  GonkaMark,
  MinusCircle,
  MirrorIcon,
  ModelMark,
  ScaleIcon,
  SearchIcon,
  ShieldCheck,
  SplitCircle,
} from "./Icons";
import { avatarStyle } from "./palette";
import { WitnessDetail } from "./WitnessDetail";
import { HingeText } from "./HingeText";
import s from "./quorum.module.css";

const LABEL_CLASS: Record<VerdictLabel, string> = {
  SUPPORTED: s.labelSupported,
  "LEANS TRUE": s.labelLeansTrue,
  UNRESOLVED: s.labelUnresolved,
  "LEANS FALSE": s.labelLeansFalse,
  REFUTED: s.labelRefuted,
  "NO SIGNAL": s.labelNoSignal,
};

const STANCE_CLASS: Record<Stance, string> = {
  SUPPORTED: s.stanceSupported,
  REFUTED: s.stanceRefuted,
  UNCERTAIN: s.stanceUncertain,
};

const DISCRIMINATION_CLASS: Record<WitnessAssessment["discriminationVerdict"], string> = {
  echo: s.tagEcho,
  coherent: s.tagCoherent,
  partial: s.tagPartial,
  unavailable: s.tagUnavailable,
};

const DISCRIMINATION_TITLE: Record<WitnessAssessment["discriminationVerdict"], string> = {
  echo: "Echo",
  coherent: "Coherent",
  partial: "Partial",
  unavailable: "Not measurable",
};

const DISCRIMINATION_NOTE: Record<WitnessAssessment["discriminationVerdict"], string> = {
  echo: "failed the mirror probe",
  coherent: "passed the mirror probe",
  partial: "decisive on one side only",
  unavailable: "the mirror probe did not return",
};

/**
 * A failed probe's error in the width of a table cell.
 *
 * The gateway's message is a sentence; the column is 6rem. An HTTP status is the
 * part a reader can act on, so it is lifted out when there is one — and when
 * there is not, the message is cut rather than dropped, because a node that
 * failed has to say so.
 */
function shortError(error: string | undefined): string {
  if (!error) return "no response";
  // Anchored to the literal "HTTP " the gateway writes, not to any 4xx/5xx-shaped
  // run of digits — an unrelated number in a future error message must not be
  // relabelled as a status code.
  const status = error.match(/HTTP (\d{3})/);
  if (status) return `HTTP ${status[1]}`;
  return error.length > 22 ? `${error.slice(0, 22).trimEnd()}…` : error;
}

/** "A, B and C" rather than "A and B and C". */
function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * A vote that was thrown out must not be painted in the colour of a vote that
 * counted. At three metres a green SUPPORTED chip under the header "ECHO —
 * FAILED THE MIRROR PROBE" reads as confirmation, which is the opposite of what
 * happened.
 */
function stanceClass(stance: Stance | null | undefined, counted: boolean): string {
  if (!stance) return s.stanceNone;
  return counted ? STANCE_CLASS[stance] : s.stanceDiscounted;
}

export function Report({ run }: { run: VerificationRun }) {
  const { prep } = run;

  return (
    <div className={s.report}>
      {/* --- what was actually checked ------------------------------------ */}
      <section className={s.claimBar}>
        <div className={s.claimBarHead}>
          <span className="eyebrow">Claim under test</span>
          <span className="eyebrow-dim">
            {run.inputKind === "url" ? "extracted from a link" : "as submitted"}
          </span>
        </div>
        <p className={s.claim}>{prep.claim}</p>
        <div className={s.claimMeta}>
          {prep.rationale ? <span>{prep.rationale}</span> : null}
          {prep.sourceUrl ? (
            <span>
              Source:{" "}
              <a href={prep.sourceUrl} target="_blank" rel="noreferrer noopener nofollow">
                {prep.sourceTitle || prep.sourceUrl}
              </a>
            </span>
          ) : null}
        </div>
        <p className={s.negation}>
          <strong>Mirror form, asked blind</strong>
          {prep.negation}
        </p>
      </section>

      {/* --- S5 : the metrics strip --------------------------------------- */}
      <MetricsStrip run={run} />

      {/* --- S4 + S8 beside S3 -------------------------------------------- */}
      <div className={s.reportGrid}>
        <div className={s.reportColumn}>
          <ThePanel run={run} />
          <WhatThisRestsOn run={run} />
        </div>

        <section className={s.panel}>
          <div className={s.panelHead}>
            <h2 className={s.panelTitle}>Reasoning trace &amp; receipts</h2>
            <p className={s.panelSub}>every inference, on a named Gonka node</p>
          </div>
          <div className={s.ledgerWrap}>
            <ReceiptLedger receipts={run.receipts} />
            <div className={s.totals}>
              <span>
                <strong>{run.totals.calls}</strong> inferences on Gonka
              </span>
              <span>
                <strong>{run.totals.tokens.toLocaleString("en-US")}</strong> tokens
              </span>
              <span>
                <strong>{(run.totals.wallMs / 1000).toFixed(1)}s</strong> wall clock
              </span>
              <span>
                <strong>
                  {new Set(run.receipts.map((r) => r.devshardId).filter(Boolean)).size}
                </strong>{" "}
                distinct nodes
              </span>
              {run.totals.failedCalls > 0 ? (
                <span>
                  <strong>{run.totals.failedCalls}</strong> failed, shown honestly above
                </span>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * S5 — the metrics strip, and the hero moment of the whole product: a high
 * nominal consensus sitting immediately beside a low Effective Witness Count.
 * The two are deliberately in the same band, at the same size, so the gap
 * between them is the thing you cannot avoid reading.
 */
function MetricsStrip({ run }: { run: VerificationRun }) {
  const { verdict, consensus } = run;
  const survived = consensus.effectiveWitnesses;
  const lost = consensus.nominalAgree - survived;

  return (
    <section className={s.metrics}>
      <div className={s.metricCell}>
        <div className={s.metricBody}>
          <span className="eyebrow">Effective witnesses</span>
          <span className={`${s.metricValue} ${s.metricValueSodium}`}>{survived.toFixed(1)}</span>
          <span className={s.metricNote}>
            of {consensus.nominalAgree} that agreed,
            <br />
            out of {consensus.respondents} that answered
          </span>
        </div>
        <span className={s.metricArt}>
          <Icosahedron size={124} />
        </span>
      </div>

      <div className={s.metricCell}>
        <div className={s.metricBody}>
          <span className={`eyebrow ${s.eyebrowSplit}`}>
            Truth <strong>score</strong>
          </span>
          <span className={s.metricValue}>
            {verdict.truthScore}
            <span className={s.metricSlash}>/</span>
            <span className={s.metricUnit}>100</span>
          </span>
          <span className={s.metricNote}>± {verdict.band} credible band</span>
          <span className={`${s.verdictPill} ${LABEL_CLASS[verdict.label]}`}>{verdict.label}</span>
        </div>
      </div>

      <div className={s.metricCell}>
        <div className={s.metricBody}>
          <span className="eyebrow">Its own arithmetic</span>
          <p className={s.formula}>
            50 + 50 × balance × weight = {verdict.truthScore}
          </p>
          <div className={s.meter}>
            <span className={s.meterHead}>
              <span>stance balance</span>
              <strong>
                {verdict.balance >= 0
                  ? `+${verdict.balance.toFixed(2)}`
                  : verdict.balance.toFixed(2)}
              </strong>
            </span>
            <span className={s.meterTrack}>
              <span
                className={`${s.meterFill} ${verdict.balance >= 0 ? s.meterFillVerify : s.meterFillRefute}`}
                style={{ width: `${Math.abs(verdict.balance) * 100}%` }}
              />
            </span>
          </div>
          <div className={s.meter}>
            <span className={s.meterHead}>
              <span>
                evidence weight, {survived.toFixed(1)} / ({survived.toFixed(1)} + 1)
              </span>
              <strong>{verdict.shrink.toFixed(2)}</strong>
            </span>
            <span className={s.meterTrack}>
              <span
                className={`${s.meterFill} ${s.meterFillVerify}`}
                style={{ width: `${verdict.shrink * 100}%` }}
              />
            </span>
          </div>
        </div>
      </div>

      <div className={s.metricCell}>
        <span className={s.metricScan} aria-hidden="true" />
        <div className={`${s.metricBody} ${s.metricStack}`}>
          <span className={s.metricReading}>
            <span className="eyebrow">Nominal consensus — what a vote would show</span>
            <span className={`${s.metricSmall} ${s.metricSmallSteel}`}>
              {consensus.nominalAgree}/{consensus.respondents}
            </span>
          </span>
          <span className={s.metricReading}>
            <span className="eyebrow">Effective witnesses — what it is actually worth</span>
            <span className={`${s.metricSmall} ${s.metricValueSodium}`}>
              {survived.toFixed(1)}
            </span>
          </span>
          {lost > 0.05 ? (
            <span className={s.metricNoteSmall}>{lostSentence(run)}</span>
          ) : null}
        </div>
        <span className={s.metricArt}>
          <Balance size={132} />
        </span>
      </div>
    </section>
  );
}

/** The one sentence that says where the missing witnesses went. */
function lostSentence(run: VerificationRun): string {
  const { consensus } = run;
  const lost = consensus.nominalAgree - consensus.effectiveWitnesses;
  const reasons = [
    consensus.lostToEcho > 0.05 &&
      `${consensus.lostToEcho.toFixed(1)} to echo${
        consensus.lostToEcho > 1.05
          ? ", models that answered the claim and its negation the same way"
          : ", a model that answered the claim and its negation the same way"
      }`,
    consensus.lostToUnmeasured > 0.05 &&
      `${consensus.lostToUnmeasured.toFixed(1)} to a mirror probe that never came back, so that independence could not be tested`,
    consensus.lostToPartial > 0.05 &&
      `${consensus.lostToPartial.toFixed(1)} to a model that was decisive one way and uncertain the other`,
    consensus.lostToRedundancy > 0.05 &&
      `${consensus.lostToRedundancy.toFixed(1)} to redundancy, ${Math.round(
        consensus.meanAnchorOverlap * 100,
      )}% ${consensus.overlapMeasured ? "measured" : "assumed"} overlap in the evidence the agreeing models lean on${
        consensus.overlapMeasured ? "" : ", because at least one named no source"
      }`,
  ].filter(Boolean);

  return `${lost.toFixed(1)} of ${consensus.nominalAgree} apparent witnesses did not survive: ${reasons.join("; ")}`;
}

/**
 * S4 — the panel, witness by witness. One row per model, columns exactly as the
 * reference lays them out: who, what its vote was worth, what it said, whether
 * it survived the mirror probe, and what it leaned on.
 */
function ThePanel({ run }: { run: VerificationRun }) {
  const { witnesses, consensus } = run;
  const echoed = witnesses.filter((w) => w.discriminationVerdict === "echo");
  const probeFor = (modelId: string, kind: "direct" | "mirror") =>
    run.probes.find((p) => p.modelId === modelId && p.kind === kind);

  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>The panel</h2>
        <p className={s.panelSub}>each model asked three ways · claim, mirror, evidence</p>
      </div>

      <div className={s.witnesses}>
        {witnesses.map((w, index) => {
          const counted = w.discrimination > 0;
          const model = modelByHouse(w.modelId);
          const direct = probeFor(w.modelId, "direct");
          const Icon =
            w.discriminationVerdict === "coherent"
              ? CheckCircle
              : w.discriminationVerdict === "echo"
                ? MirrorIcon
                : w.discriminationVerdict === "partial"
                  ? SplitCircle
                  : MinusCircle;

          return (
            <article
              key={w.modelId}
              className={`${s.witness} ${
                w.discriminationVerdict === "echo"
                  ? s.witnessEcho
                  : counted
                    ? s.witnessCounted
                    : ""
              }`}
            >
              <div className={s.witnessIdent}>
                <span
                  className={`${s.avatar} ${s.avatarLg}`}
                  style={avatarStyle(w.modelId)}
                  aria-hidden="true"
                >
                  <ModelMark index={index} size={22} />
                </span>
                <span>
                  <span className={s.witnessName}>{labelFor(w.modelId)}</span>
                  <br />
                  <span className={s.witnessHouse}>{model?.house ?? ""}</span>
                </span>
              </div>

              <div className={s.witnessCol}>
                <span className={s.witnessMetaLabel}>vote weight</span>
                <span
                  className={`${s.witnessMetaValue} ${counted ? "" : s.witnessMetaValueZero}`}
                >
                  {w.discrimination.toFixed(2)}
                </span>
              </div>

              <div className={s.witnessCol}>
                <span className={`${s.stanceWord} ${stanceClass(w.stance, counted)}`}>
                  {w.stance ?? "NO ANSWER"}
                </span>
                <span className={s.witnessMetaLabel}>
                  {w.stance ? `confidence ${w.confidence.toFixed(2)}` : shortError(direct?.error)}
                </span>
              </div>

              <div className={s.witnessCol}>
                <span className={s.checkRow}>
                  <span className={DISCRIMINATION_CLASS[w.discriminationVerdict]}>
                    <Icon size={19} />
                  </span>
                  {DISCRIMINATION_TITLE[w.discriminationVerdict]}
                </span>
                <span className={s.witnessMetaNote}>
                  {DISCRIMINATION_NOTE[w.discriminationVerdict]}
                </span>
              </div>

              <div className={s.witnessCol}>
                {w.anchors.length > 0 ? (
                  <>
                    <span className={s.witnessMetaLabel}>evidence it leaned on</span>
                    <span className={s.anchorChips}>
                      {w.anchors.slice(0, 3).map((anchor, i) => (
                        <span key={anchor} className={s.anchorChip} title={anchor}>
                          {i === 0 ? <DocIcon size={15} /> : i === 1 ? <SearchIcon size={15} /> : <ScaleIcon size={15} />}
                        </span>
                      ))}
                      {w.anchors.length > 3 ? (
                        <span className={s.anchorMore}>+{w.anchors.length - 3}</span>
                      ) : null}
                    </span>
                    {w.echoesWith.length > 0 ? (
                      <span className={s.anchorShared}>
                        shares evidence with {w.echoesWith.map(labelFor).join(", ")}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className={s.witnessMetaLabel}>evidence it leaned on</span>
                    <span className={s.anchorNone}>
                      {w.reachable
                        ? "named no source, independence assumed"
                        : "this Gonka node did not return a usable answer"}
                    </span>
                  </>
                )}
              </div>

              <WitnessDetail
                reasoning={
                  direct?.reasoning || direct?.error || "This Gonka node did not return an answer."
                }
                mirrorStance={w.mirrorStance}
                mirrorReasoning={
                  probeFor(w.modelId, "mirror")?.reasoning ||
                  probeFor(w.modelId, "mirror")?.error ||
                  "This probe did not return."
                }
                note={w.note}
                anchors={w.anchors}
                stanceClassName={stanceClass(w.mirrorStance, counted)}
              />
            </article>
          );
        })}
      </div>

      {echoed.length > 0 ? (
        <p className={s.panelSub} style={{ padding: "0 1.15rem 1.15rem" }}>
          {list(echoed.map((w) => labelFor(w.modelId)))}{" "}
          {echoed.length === 1 ? "answered" : "each answered"} the claim and its negation the same
          way
          {echoed.length === 1 && echoed[0].stance ? ` — ${echoed[0].stance} to both` : ""}. That is
          a model reading the shape of the sentence rather than the fact, so the vote carries no
          information and is excluded from the count.
        </p>
      ) : null}

      {consensus.contested && consensus.dissenters.length > 0 ? (
        <p className={s.panelSub} style={{ padding: "0 1.15rem 1.15rem" }}>
          The panel is split. On the minority side: {list(consensus.dissenters.map(labelFor))}.
        </p>
      ) : null}
    </section>
  );
}

/** S8 — what the verdict rests on, adjudicated on Gonka. */
function WhatThisRestsOn({ run }: { run: VerificationRun }) {
  const { adjudication, consensus } = run;

  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>What this rests on</h2>
      </div>
      <div className={s.hinge}>
        <div className={s.hingeCell}>
          <span className={s.hingeHead}>
            <ShieldCheck size={17} />
            adjudicated on Gonka
          </span>
          <span className={s.hingeMark}>
            <GonkaMark size={68} className={s.wordmarkMark} />
          </span>
          {/* The plain-language verdict sentence. The reference gives this cell
              only the mark; a reader who reads one line of the report should
              read this one, so it goes under it rather than nowhere. */}
          <HingeText>{run.verdict.headline}</HingeText>
        </div>

        <div className={s.hingeCell}>
          <span className={s.hingeArt} aria-hidden="true">
            <Ridge size={128} />
          </span>
          <span className={s.hingeHead}>
            <DocIcon size={17} />
            Load-bearing fact
          </span>
          <HingeText>
            {adjudication.loadBearingFact || "The adjudicating node did not return this field."}
          </HingeText>
        </div>

        <div className={s.hingeCell}>
          <span className={s.hingeArt} aria-hidden="true">
            <Spiral size={116} />
          </span>
          <span className={s.hingeHead}>
            <SearchIcon size={17} />
            What would flip it
          </span>
          <HingeText>
            {adjudication.falsifier || "The adjudicating node did not return this field."}
          </HingeText>
        </div>

        <div className={s.hingeCell}>
          <span className={s.hingeArt} aria-hidden="true">
            <Spiral size={150} open />
          </span>
          <span className={s.hingeHead}>
            <ScaleIcon size={17} />
            {consensus.contested ? "Where the panel splits" : "Why they agreed"}
          </span>
          <HingeText>
            {consensus.contested && adjudication.contention
              ? adjudication.contention
              : adjudication.agreementDiagnosis || "No closing note was returned."}
          </HingeText>
        </div>
      </div>
    </section>
  );
}
