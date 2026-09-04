import { ClaimScene, EvidenceScene, MirrorScene } from "./Scenes";
import s from "./quorum.module.css";

/**
 * S2 — the mechanism, three probe cards. A visitor who never runs a check should
 * still leave knowing what is different about this one.
 */
export function Mechanism() {
  return (
    <div className={s.mechanism}>
      <article className={s.step}>
        <div className={s.stepScene}>
          <ClaimScene />
        </div>
        <span className={s.stepIndex}>Probe 01 · the claim</span>
        <h2 className={s.stepTitle}>What do you think?</h2>
        <p className={s.stepBody}>
          Every model on the panel assesses the claim and names the evidence it is leaning on. This
          is the part every other fact checker stops at.
        </p>
        <span className={s.stepNumeral} aria-hidden="true">
          01
        </span>
      </article>

      <article className={s.step}>
        <div className={s.stepScene}>
          <MirrorScene />
        </div>
        <span className={s.stepIndex}>Probe 02 · the mirror</span>
        <h2 className={s.stepTitle}>And the opposite?</h2>
        <p className={s.stepBody}>
          The claim is negated and put to each model again, blind, in a fresh request. A model that
          answers both the same way is reading the sentence, not the fact — and its vote is thrown
          out, with both answers shown.
        </p>
        <span className={s.stepNumeral} aria-hidden="true">
          02
        </span>
      </article>

      <article className={s.step}>
        <div className={s.stepScene}>
          <EvidenceScene />
        </div>
        <span className={s.stepIndex}>Probe 03 · the evidence</span>
        <h2 className={s.stepTitle}>Says who?</h2>
        <p className={s.stepBody}>
          Models converging on one source are one witness, not three. The overlap is measured and the
          truth score is discounted by it — so a unanimous panel can be worth 1.1 witnesses, and the
          report says so.
        </p>
        <span className={s.stepNumeral} aria-hidden="true">
          03
        </span>
      </article>
    </div>
  );
}
