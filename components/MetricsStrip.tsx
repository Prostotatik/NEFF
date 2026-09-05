"use client";

import { useState } from "react";
import type { VerdictLabel, VerificationRun } from "@/lib/types";
import { Balance, Icosahedron } from "./Orbs";
import { ArithmeticPanel } from "./Arithmetic";
import s from "./quorum.module.css";

const LABEL_CLASS: Record<VerdictLabel, string> = {
  SUPPORTED: s.labelSupported,
  "LEANS TRUE": s.labelLeansTrue,
  UNRESOLVED: s.labelUnresolved,
  "LEANS FALSE": s.labelLeansFalse,
  REFUTED: s.labelRefuted,
  "NO SIGNAL": s.labelNoSignal,
};

/**
 * S5 — the metrics strip, and the hero moment of the whole product: a high
 * nominal consensus sitting immediately beside a low Effective Witness Count.
 * The two are deliberately in the same band, at the same size, so the gap
 * between them is the thing you cannot avoid reading.
 *
 * A client component because of one thing: the arithmetic cell can open a
 * derivation of every constant in the formula, and that panel spans the whole
 * strip as a row of the same grid rather than being squeezed into one column.
 */
export function MetricsStrip({ run }: { run: VerificationRun }) {
  const { verdict, consensus } = run;
  const [showArithmetic, setShowArithmetic] = useState(false);
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
          <p className={s.formula}>50 + 50 × balance × weight = {verdict.truthScore}</p>
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
          <button
            type="button"
            className={s.arithmeticToggle}
            onClick={() => setShowArithmetic(!showArithmetic)}
            aria-expanded={showArithmetic}
          >
            {showArithmetic ? "− hide where these numbers come from" : "+ where these numbers come from"}
          </button>
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
            <span className={`${s.metricSmall} ${s.metricSmallSodium}`}>{survived.toFixed(1)}</span>
          </span>
          {lost > 0.05 ? <span className={s.metricNoteSmall}>{lostSentence(run)}</span> : null}
        </div>
        <span className={s.metricArt}>
          <Balance size={132} />
        </span>
      </div>

      {showArithmetic ? <ArithmeticPanel verdict={verdict} consensus={consensus} /> : null}
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
