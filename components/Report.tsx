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

export function Report({ run }: { run: VerificationRun }) {
  const { prep, consensus, witnesses, adjudication, receipts, totals } = run;
  const directProbe = (modelId: string) =>
    run.probes.find((p) => p.modelId === modelId && p.kind === "direct");

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
                <span className={s.confidence}>
                  vote weight {w.discrimination.toFixed(2)}
                </span>
              </div>

              <div>
                <div className={s.stanceRow}>
                  <span
                    className={`${s.stanceTag} ${w.stance ? STANCE_CLASS[w.stance] : s.stanceNone}`}
                  >
                    {w.stance ?? "NO ANSWER"}
                  </span>
                  {w.stance ? (
                    <span className={s.confidence}>self-reported confidence {w.confidence.toFixed(2)}</span>
                  ) : null}
                </div>
                <p className={s.reasoning}>
                  {directProbe(w.modelId)?.reasoning ||
                    directProbe(w.modelId)?.error ||
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
                <div className={s.stanceRow}>
                  <span className={s.confidence}>on the claim</span>
                  <span className={`${s.stanceTag} ${w.stance ? STANCE_CLASS[w.stance] : s.stanceNone}`}>
                    {w.stance ?? "—"}
                  </span>
                </div>
                <div className={s.stanceRow}>
                  <span className={s.confidence}>on its negation</span>
                  <span
                    className={`${s.stanceTag} ${w.mirrorStance ? STANCE_CLASS[w.mirrorStance] : s.stanceNone}`}
                  >
                    {w.mirrorStance ?? "—"}
                  </span>
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
          <h2 className={s.sectionTitle}>Receipt ledger</h2>
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
  const { verdict, consensus } = run;
  const panelSize = Math.max(consensus.respondents, 1);
  const nominalPct = (consensus.nominalAgree / panelSize) * 100;
  const effectivePct = (consensus.effectiveWitnesses / panelSize) * 100;
  const lost = consensus.nominalAgree - consensus.effectiveWitnesses;

  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>Verdict</h2>
        <span className="eyebrow">truth score, discounted by measured independence</span>
      </div>
      <div className={s.verdict}>
        <div className={s.verdictScore}>
          <div className={s.scoreNumber}>
            {verdict.truthScore}
            <span className={s.scoreUnit}>/100</span>
          </div>
          <div className={s.scoreBand}>± {verdict.band} credible band</div>
          <div className={`${s.scoreLabel} ${LABEL_CLASS[verdict.label]}`}>{verdict.label}</div>
        </div>

        <div className={s.collapse}>
          <div className={s.gauge}>
            <div className={s.gaugeHead}>
              <span className={s.gaugeLabel}>Nominal consensus — what a vote would show</span>
              <span className={`${s.gaugeValue} ${s.gaugeValueNominal}`}>
                {consensus.nominalAgree}/{consensus.respondents}
              </span>
            </div>
            <div className={s.track}>
              <div
                className={s.fillNominal}
                style={{
                  width: `${nominalPct}%`,
                  ["--seg" as string]: `${100 / panelSize}%`,
                }}
              />
            </div>
          </div>

          <div className={s.gauge}>
            <div className={s.gaugeHead}>
              <span className={s.gaugeLabel}>Effective witnesses — what it is actually worth</span>
              <span className={`${s.gaugeValue} ${s.gaugeValueEffective}`}>
                {consensus.effectiveWitnesses.toFixed(1)}
              </span>
            </div>
            <div className={s.track}>
              <div className={s.fillEffective} style={{ width: `${effectivePct}%` }} />
            </div>
            {lost > 0.05 ? (
              <span className={s.lost}>
                {lost.toFixed(1)} of {consensus.nominalAgree} apparent witnesses were echo —{" "}
                {Math.round(consensus.meanAnchorOverlap * 100)}%{" "}
                {consensus.overlapMeasured ? "measured" : "assumed"} evidence overlap between the
                models that agree
                {consensus.overlapMeasured
                  ? ""
                  : " (at least one named no source, so independence could not be observed)"}
              </span>
            ) : null}
          </div>

          <p className={s.headline}>{verdict.headline}</p>
        </div>
      </div>
    </section>
  );
}
