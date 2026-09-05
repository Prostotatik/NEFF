import { ClaimScene, EvidenceScene, MirrorScene } from "./Scenes";
import s from "./neff.module.css";

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
          Every model answers, and names the evidence it leaned on. Every other fact checker stops
          here.
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
          Now the negated claim, blind. Answer both the same way and you are reading the sentence,
          not the fact — vote thrown out.
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
          Three models reading one page are one witness. The overlap is measured, and the score
          discounted by it — unanimous can mean 1.1.
        </p>
        <span className={s.stepNumeral} aria-hidden="true">
          03
        </span>
      </article>
    </div>
  );
}
