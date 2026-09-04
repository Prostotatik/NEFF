import { labelFor, modelByHouse } from "@/lib/models";
import type { Stance, VerdictLabel, VerificationRun, WitnessAssessment } from "@/lib/types";
import { ReceiptLedger } from "./ReceiptLedger";
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
  echo: "Echo — failed the mirror probe",
  coherent: "Coherent — passed the mirror probe",
  partial: "Partial — decisive on one side only",
  unavailable: "Not measurable",
};

/** "A, B and C" rather than "A and B and C". */
function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The panel card has room for the gist, not the whole answer; the ledger has the rest. */
function truncate(text: string | undefined, max = 260): string {
  if (!text) return "";
  const flat = text.split("\n\nDecisive evidence:")[0].trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
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
  const { prep, consensus, witnesses, adjudication, receipts, totals } = run;
  const probeFor = (modelId: string, kind: "direct" | "mirror") =>
    run.probes.find((p) => p.modelId === modelId && p.kind === kind);

  return (
    <div className={s.report}>
      {/* --- what was actually checked ------------------------------------ */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <span className="eyebrow">Claim under test</span>
          <span className="eyebrow mono">
            {run.inputKind === "url" ? "extracted from a link" : "as submitted"}
          </span>
        </div>
        <p className={s.claim}>{prep.claim}</p>
        <div className={s.claimMeta}>
          {prep.rationale ? <p>{prep.rationale}</p> : null}
          {prep.sourceUrl ? (
            <p>
              Source:{" "}
              <a href={prep.sourceUrl} target="_blank" rel="noreferrer noopener nofollow">
                {prep.sourceTitle || prep.sourceUrl}
              </a>
            </p>
          ) : null}
        </div>
        <p className={s.negation}>
          <span className="eyebrow">Mirror form, asked blind</span>
          <br />
          {prep.negation}
        </p>
      </section>

      {/* --- the hero ------------------------------------------------------ */}
      <VerdictCard run={run} />

      {/* --- what the verdict hinges on ------------------------------------ */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>What this rests on</h2>
          <span className="eyebrow">adjudicated on Gonka</span>
        </div>
        <div className={s.hinge}>
          <div className={s.hingeCell}>
            <span className={s.hingeLabel}>Load-bearing fact</span>
            <p className={s.hingeBody}>
              {adjudication.loadBearingFact || "The adjudicating node did not return this field."}
            </p>
          </div>
          <div className={s.hingeCell}>
            <span className={s.hingeLabel}>What would flip it</span>
            <p className={s.hingeBody}>
              {adjudication.falsifier || "The adjudicating node did not return this field."}
            </p>
          </div>
          <div className={s.hingeCell}>
            <span className={s.hingeLabel}>
              {consensus.contested ? "Where the panel splits" : "Why they agreed"}
            </span>
            <p className={s.hingeBodyDim}>
              {consensus.contested && adjudication.contention
                ? adjudication.contention
                : adjudication.agreementDiagnosis || "No closing note was returned."}
            </p>
          </div>
        </div>
      </section>

      {/* --- the panel, witness by witness --------------------------------- */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>The panel</h2>
          <span className="eyebrow">
            each model asked three ways · claim, mirror, evidence
          </span>
        </div>
        <div className={s.witnesses}>
          {witnesses.map((w) => (
            <article
              key={w.modelId}
              className={`${s.witness} ${w.discriminationVerdict === "echo" ? s.witnessEcho : ""}`}
            >
              <div className={s.witnessName}>
                <span className={s.witnessLabel}>{labelFor(w.modelId)}</span>
                <span className={s.witnessHouse}>{modelByHouse(w.modelId)?.house ?? ""}</span>
                <div className={s.weightBar} aria-hidden="true">
                  <div className={s.weightFill} style={{ width: `${w.discrimination * 100}%` }} />
                </div>
                <span
                  className={`${s.voteWeight} ${w.discrimination === 0 ? s.voteWeightZero : ""}`}
                >
                  vote weight <strong>{w.discrimination.toFixed(2)}</strong>
                </span>
              </div>

              <div>
                <div className={s.stanceRow}>
                  <span className={`${s.stanceTag} ${stanceClass(w.stance, w.discrimination > 0)}`}>
                    {w.stance ?? "NO ANSWER"}
                  </span>
                  {w.stance ? (
                    <span className={s.confidence}>self-reported confidence {w.confidence.toFixed(2)}</span>
                  ) : null}
                </div>
                <p className={s.reasoning}>
                  {probeFor(w.modelId, "direct")?.reasoning ||
                    probeFor(w.modelId, "direct")?.error ||
                    "This Gonka node did not return an answer."}
                </p>
                {w.anchors.length > 0 ? (
                  <div className={s.anchorList}>
                    <span className="eyebrow">evidence it leaned on</span>
                    {w.anchors.map((anchor) => (
                      <span key={anchor}>— {anchor}</span>
                    ))}
                    {w.echoesWith.length > 0 ? (
                      <span className={s.anchorShared}>
                        shares this evidence base with {w.echoesWith.map(labelFor).join(", ")}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className={s.anchorList}>
                    <span className="eyebrow">evidence it leaned on</span>
                    <span className={s.anchorShared}>
                      — named no source, so its independence is assumed, not measured
                    </span>
                  </div>
                )}
              </div>

              <div className={s.mirrorBox}>
                <span className={`${s.verdictTag} ${DISCRIMINATION_CLASS[w.discriminationVerdict]}`}>
                  {DISCRIMINATION_TITLE[w.discriminationVerdict]}
                </span>
                {/* The claim-side prose is already in the column to the left; only the
                    stance is repeated here, so the two answers can be read against each
                    other without saying the same thing twice. */}
                <div className={s.stanceRow}>
                  <span className={s.confidence}>on the claim</span>
                  <span className={`${s.stanceTag} ${stanceClass(w.stance, w.discrimination > 0)}`}>
                    {w.stance ?? "—"}
                  </span>
                </div>

                <div className={s.mirrorSide}>
                  <div className={s.stanceRow}>
                    <span className={s.confidence}>on its negation, blind</span>
                    <span className={`${s.stanceTag} ${stanceClass(w.mirrorStance, w.discrimination > 0)}`}>
                      {w.mirrorStance ?? "—"}
                    </span>
                  </div>
                  <p className={s.mirrorQuote}>
                    {truncate(probeFor(w.modelId, "mirror")?.reasoning) ||
                      probeFor(w.modelId, "mirror")?.error ||
                      "This probe did not return."}
                  </p>
                </div>

                <p className={s.mirrorNote}>{w.note}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* --- the proof ----------------------------------------------------- */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>Reasoning trace &amp; receipts</h2>
          <span className="eyebrow">every inference, on a named Gonka node</span>
        </div>
        <ReceiptLedger receipts={receipts} />
        <div className={s.totals}>
          <span>
            <strong>{totals.calls}</strong> inferences on Gonka
          </span>
          <span>
            <strong>{totals.tokens.toLocaleString("en-US")}</strong> tokens
          </span>
          <span>
            <strong>{(totals.wallMs / 1000).toFixed(1)}s</strong> wall clock
          </span>
          <span>
            <strong>{new Set(receipts.map((r) => r.devshardId).filter(Boolean)).size}</strong> distinct
            nodes
          </span>
          {totals.failedCalls > 0 ? (
            <span>
              <strong>{totals.failedCalls}</strong> failed, shown honestly above
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function VerdictCard({ run }: { run: VerificationRun }) {
  const { verdict, consensus, witnesses } = run;
  // Both gauges are drawn against the same denominator — the size of the panel —
  // so the sodium bar can be read directly against the steel one. Scaling them
  // separately would make an echo look like corroboration.
  const panelSize = Math.max(witnesses.length, 1);
  const lost = consensus.nominalAgree - consensus.effectiveWitnesses;
  const echoed = witnesses.filter((w) => w.discriminationVerdict === "echo");
  const survived = consensus.effectiveWitnesses;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>Verdict</h2>
        <span className="eyebrow">truth score, discounted by measured independence</span>
      </div>
      <div className={s.verdict}>
        {/* The Effective Witness Count is the argument, so it is the loudest
            thing on the page. The truth score sits under it: a judge should read
            "0.0 witnesses" first and "50/100" second, because the second only
            means anything in light of the first. */}
        <div className={s.verdictScore}>
          <span className={s.gaugeLabel}>Effective witnesses</span>
          <div className={s.witnessNumber}>{survived.toFixed(1)}</div>
          <div className={s.scoreBand}>
            of {consensus.nominalAgree} that agreed, out of {consensus.respondents} that answered
          </div>

          <div className={s.scoreBlock}>
            <span className={s.gaugeLabel}>Truth score</span>
            <div className={s.scoreNumber}>
              {verdict.truthScore}
              <span className={s.scoreUnit}>/100</span>
            </div>
            <div className={s.scoreBand}>± {verdict.band} credible band</div>
            <div className={`${s.scoreLabel} ${LABEL_CLASS[verdict.label]}`}>{verdict.label}</div>
          </div>

          <div className={s.derivation}>
            <span className="eyebrow">its own arithmetic</span>
            <div className={s.derivationRow}>
              <span>stance balance</span>
              <span>
                {verdict.balance >= 0 ? `+${verdict.balance.toFixed(2)}` : verdict.balance.toFixed(2)}
              </span>
            </div>
            <div className={s.derivationRow}>
              <span>
                evidence weight, {survived.toFixed(1)} / ({survived.toFixed(1)} + 1)
              </span>
              <span>{verdict.shrink.toFixed(2)}</span>
            </div>
            <div className={s.derivationRow}>
              <span>50 + 50 × balance × weight</span>
              <span className={s.derivationTotal}>{verdict.truthScore}</span>
            </div>
          </div>
        </div>

        <div className={s.collapse}>
          <div className={s.gauge}>
            <div className={s.gaugeHead}>
              <span className={s.gaugeLabel}>Nominal consensus — what a vote would show</span>
              <span className={`${s.gaugeValue} ${s.gaugeValueNominal}`}>
                {consensus.nominalAgree}/{consensus.respondents}
              </span>
            </div>
            <div className={s.slots} aria-hidden="true">
              {Array.from({ length: panelSize }, (_, i) => (
                <div key={i} className={i < consensus.nominalAgree ? s.slotOn : s.slot} />
              ))}
            </div>
          </div>

          <div className={s.gauge}>
            <div className={s.gaugeHead}>
              <span className={s.gaugeLabel}>Effective witnesses — what it is actually worth</span>
              <span className={`${s.gaugeValue} ${s.gaugeValueEffective}`}>
                {survived.toFixed(1)}
              </span>
            </div>
            {/* Same slot geometry as the gauge above, so an empty bar reads as
                "three places, none filled" rather than as a horizontal rule. */}
            <div className={s.slotsEffective} aria-hidden="true">
              {Array.from({ length: panelSize }, (_, i) => (
                <div key={i} className={s.slotEmpty}>
                  <div
                    className={s.slotFill}
                    style={{ width: `${Math.min(1, Math.max(0, survived - i)) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            {lost > 0.05 ? (
              <p className={s.lost}>
                {lost.toFixed(1)} of {consensus.nominalAgree} apparent witnesses did not survive:{" "}
                {[
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
                    `${consensus.lostToRedundancy.toFixed(1)} to redundancy, ${Math.round(consensus.meanAnchorOverlap * 100)}% ${consensus.overlapMeasured ? "measured" : "assumed"} overlap in the evidence the agreeing models lean on${consensus.overlapMeasured ? "" : ", because at least one named no source"}`,
                ]
                  .filter(Boolean)
                  .join("; ")}
              </p>
            ) : null}
          </div>

          {echoed.length > 0 ? (
            <div className={s.excluded}>
              <span className={s.excludedLabel}>
                {echoed.length === 1 ? "Vote thrown out" : "Votes thrown out"}
              </span>
              <p className={s.excludedBody}>
                {list(echoed.map((w) => labelFor(w.modelId)))}{" "}
                {echoed.length === 1 ? "answered" : "each answered"} the claim and its negation the
                same way
                {echoed.length === 1 && echoed[0].stance ? ` — ${echoed[0].stance} to both` : ""}.
                {echoed.length === 1
                  ? " That is a model reading the shape of the sentence rather than the fact, so its vote carries no information and is excluded from the count."
                  : " Those are models reading the shape of the sentence rather than the fact, so their votes carry no information and are excluded from the count."}
              </p>
            </div>
          ) : null}

          <p className={s.headline}>{verdict.headline}</p>
        </div>
      </div>
    </section>
  );
}
