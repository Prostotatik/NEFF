import { GonkaMark } from "./Icons";
import s from "./quorum.module.css";

/**
 * S9 — the masthead. Mark, wordmark, and the "by Gonka" badge on the left; the
 * network status pill on the right. The pill is not a decoration: every
 * inference in this app is served by api.gonkarouter.io, and the dot is the
 * standing reminder of it.
 */
export function Masthead() {
  return (
    <div className={s.masthead}>
      <a className={s.wordmark} href="/">
        <GonkaMark size={27} className={s.wordmarkMark} />
        <span className={s.wordmarkName}>Quorum</span>
        <span className={s.wordmarkBadge}>
          by <strong>Gonka</strong>
        </span>
      </a>
      <span className={s.networkPill}>
        <span className={s.liveDot} aria-hidden="true" />
        On Gonka Network
      </span>
    </div>
  );
}

export function Footer() {
  return (
    <footer className={s.footer}>
      <span>
        a quorum is the number of <strong>independent</strong> witnesses a decision needs to
        count · every inference routed through <strong>api.gonkarouter.io</strong>
      </span>
      <span>no verdict reaches 100 — a panel of models is evidence, never proof</span>
    </footer>
  );
}
