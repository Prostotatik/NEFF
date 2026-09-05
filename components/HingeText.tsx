"use client";

import { useState } from "react";
import s from "./neff.module.css";

/**
 * One column of "what this rests on".
 *
 * The reference's four columns are level, because the text in it is short. The
 * adjudicating node's real closing note is often three times the length of the
 * other fields, which drags the whole band down and breaks the row the reference
 * builds. Clamping levels the band; the toggle means nothing the node actually
 * said is thrown away, which is the part that is not negotiable.
 */
export function HingeText({ children }: { children: string }) {
  const [open, setOpen] = useState(false);
  const long = children.length > 190;

  return (
    <>
      <p className={`${s.hingeBody} ${long && !open ? s.hingeBodyClamped : ""}`}>{children}</p>
      {long ? (
        <button type="button" className={s.hingeMore} onClick={() => setOpen(!open)}>
          {open ? "less" : "read the whole note"}
        </button>
      ) : null}
    </>
  );
}
