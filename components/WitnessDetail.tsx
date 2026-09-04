"use client";

import { useState } from "react";
import s from "./quorum.module.css";

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
}: {
  reasoning: string;
  mirrorStance: string | null;
  mirrorReasoning: string;
  note: string;
  anchors: string[];
  stanceClassName: string;
}) {
  const [open, setOpen] = useState(false);

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

          <p className={s.mirrorNote}>{note}</p>
        </div>
      ) : null}
    </>
  );
}
