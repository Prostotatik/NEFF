import s from "./quorum.module.css";

export function Masthead() {
  return (
    <div className={s.masthead}>
      <a className={s.wordmark} href="/">
        <span className={s.wordmarkName}>Quorum</span>
        <span className={s.wordmarkDot} aria-hidden="true" />
      </a>
      <span className={s.mastheadNote}>
        a quorum is the number of <strong>independent</strong> witnesses a decision needs to count
      </span>
    </div>
  );
}

export function Footer() {
  return (
    <footer className={s.footer}>
      <span>
        every inference routed through <strong>api.gonkarouter.io</strong>
      </span>
      <span>no verdict reaches 100 — a panel of models is evidence, never proof</span>
    </footer>
  );
}
