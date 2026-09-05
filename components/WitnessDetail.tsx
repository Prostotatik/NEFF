"use client";

import { useState } from "react";
import s from "./neff.module.css";

/**
 * The full answer behind one panel row.
 *
 * The reference's panel row is a single line of summary, which is the right
 * density for the page — but the model's actual words, its blind answer to the
 * negated claim, and the sources it named are the evidence the whole product
 * rests on, so they are one click away rather than gone.
 */
export function WitnessDetail({
  reasoning,
  mirrorStance,
  mirrorReasoning,
  note,
  anchors,
  stanceClassName,
  thinking,
  recovered,
}: {
  reasoning: string;
  mirrorStance: string | null;
  mirrorReasoning: string;
  note: string;
  anchors: string[];
  stanceClassName: string;
  /** The model's own chain of thought on the claim, when the node returned one. */
  thinking?: string;
  /** True when the structured answer had to be recovered from that working. */
  recovered?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showWorking, setShowWorking] = useState(false);

  return (
    <>
      <button
        type="button"
        className={s.witnessDetailToggle}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{open ? "hide what it actually said" : "what it actually said"}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className={s.witnessDetail}>
          <div>
            <span className={s.detailLabel}>on the claim, as stated</span>
            <p className={s.reasoning}>{reasoning}</p>
          </div>

          <div>
            <span className={s.detailLabel}>
              on its negation, asked blind ·{" "}
              <span className={stanceClassName}>{mirrorStance ?? "—"}</span>
            </span>
            <p className={s.mirrorQuote}>{mirrorReasoning}</p>
          </div>

          {anchors.length > 0 ? (
            <div>
              <span className={s.detailLabel}>evidence it named</span>
              {anchors.map((anchor) => (
                <p key={anchor} className={s.reasoning}>
                  — {anchor}
                </p>
              ))}
            </div>
          ) : null}

          {/* The working the answer was written from. A model's structured answer
              is a summary of this, and a summary leaves things out — an evidence
              base it weighed and then did not list, or, when the node's token
              ceiling lands mid-thought, the whole answer. Kept out of the way,
              but never discarded. */}
          {thinking ? (
            <div>
              <span className={s.detailLabel}>
                its working, before it answered
                {recovered ? " · this is where its answer was recovered from" : ""}
              </span>
              <button
                type="button"
                className={s.workingToggle}
                onClick={() => setShowWorking(!showWorking)}
                aria-expanded={showWorking}
              >
                {showWorking ? "hide the reasoning trace" : "read the reasoning trace"}
              </button>
              {showWorking ? <pre className={s.working}>{thinking}</pre> : null}
            </div>
          ) : null}

          <p className={s.mirrorNote}>{note}</p>
        </div>
      ) : null}
    </>
  );
}
