"use client";

import { useEffect, useState } from "react";
import type { PopularClaim, RunSummary, VerdictLabel } from "@/lib/types";
import { ArrowRight, LinkIcon, ShieldCheck, TextIcon } from "./Icons";
import s from "./quorum.module.css";

/**
 * What the rail shows before anything has been asked.
 *
 * The slot used to hold the Verification Details panel with every field reading
 * "—", which is a report of a run that has not happened. Nothing about it was
 * true yet, and an empty scaffold is the least interesting thing a landing page
 * can put in its most valuable column.
 *
 * So the idle state shows the two things that are real at that moment: what this
 * instance has been asked about most, and what it finished most recently. Both
 * are read from the same `.runs/` directory the permalinks are served from.
 *
 * The counts include this build's own test traffic, and the lead says so. Every
 * row on a fresh clone is a claim from the QA corpus, and a list headed "most
 * checked" that quietly reads as other people's interest would be manufactured
 * social proof on a landing page whose entire pitch is measured honesty.
 *
 * The two lists behave differently on purpose, because they answer different
 * questions. A popular claim is a *suggestion*: clicking one fills the box and
 * leaves the cursor there, because running it is the user's decision and their
 * eleven inferences. A recent check is a *record*: clicking one opens that
 * report, the real stored one, exactly as the person who ran it saw it.
 */

/** Colour only. The report's pill styling is for the report's pill. */
const LABEL_CLASS: Record<VerdictLabel, string> = {
  SUPPORTED: s.idleVerdictTrue,
  "LEANS TRUE": s.idleVerdictTrue,
  UNRESOLVED: s.idleVerdictNeutral,
  "NO SIGNAL": s.idleVerdictNeutral,
  "LEANS FALSE": s.idleVerdictFalse,
  REFUTED: s.idleVerdictFalse,
};

interface History {
  popular: PopularClaim[];
  recent: RunSummary[];
}

export function IdleRail({ onPick }: { onPick: (input: string) => void }) {
  const [tab, setTab] = useState<"popular" | "recent">("popular");
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/history")
      .then((r) => r.json())
      .then((data: History) => {
        if (!cancelled) setHistory(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const popular = history?.popular ?? [];
  const recent = history?.recent ?? [];
  const list = tab === "popular" ? popular : recent;
  // A clean checkout has no runs, which is exactly what a judge sees first. A
  // header reading "Already checked here" above "nothing has been checked here"
  // is the sort of small lie that costs more trust than the panel earns, and
  // two tabs onto two empty lists are furniture. Both go until there is
  // something to show.
  const bare = history !== null && popular.length === 0 && recent.length === 0;

  return (
    <aside className={s.rail}>
      <div className={s.railHead}>
        <ShieldCheck size={20} />
        {bare ? "Nothing checked here yet" : "Already checked here"}
      </div>

      {bare ? null : (
        <>
          <div className={s.idleTabs} role="tablist" aria-label="Past verifications">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "popular"}
              className={`${s.idleTab} ${tab === "popular" ? s.idleTabOn : ""}`}
              onClick={() => setTab("popular")}
            >
              Most checked
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "recent"}
              className={`${s.idleTab} ${tab === "recent" ? s.idleTabOn : ""}`}
              onClick={() => setTab("recent")}
            >
              Recent checks
            </button>
          </div>

          <p className={s.idleLead}>
            {tab === "popular"
              ? "What this instance has been asked about most, this build's own test runs included. Picking one fills the box; you still press verify."
              : "Finished verifications, newest first. Opening one shows that run's real report, receipts and all."}
          </p>
        </>
      )}

      <div className={s.idleList} role="tabpanel">
        {history === null && !failed ? (
          <>
            <span className={s.idleSkeleton} aria-hidden="true" />
            <span className={s.idleSkeleton} aria-hidden="true" />
            <span className={s.idleSkeleton} aria-hidden="true" />
            <span className={s.idleEmpty}>Reading what has been checked…</span>
          </>
        ) : failed ? (
          <span className={s.idleEmpty}>
            The list of past checks could not be read. Verification itself is unaffected — it does
            not go through this.
          </span>
        ) : list.length === 0 ? (
          <span className={s.idleEmpty}>
            Nothing has been checked on this instance yet. Paste a claim above and it will be the
            first.
          </span>
        ) : tab === "popular" ? (
          popular.map((item) => (
            <button
              key={item.input}
              type="button"
              className={s.idleRow}
              onClick={() => onPick(item.input)}
              title={`Put this in the box: ${item.input}`}
            >
              <span className={s.idleRowIcon} aria-hidden="true">
                {item.inputKind === "url" ? <LinkIcon size={14} /> : <TextIcon size={14} />}
              </span>
              <span className={s.idleRowMain}>
                <span className={s.idleRowClaim}>{item.claim}</span>
                <span className={s.idleRowMeta}>
                  last verdict{" "}
                  <span className={`${s.idleVerdict} ${LABEL_CLASS[item.latestLabel]}`}>
                    {item.latestLabel}
                  </span>
                </span>
              </span>
              {/* The count is what makes this list "most checked", so it is the
                  right-hand element rather than a clause buried in the meta
                  line — and it distinguishes these rows from the recent ones,
                  which carry an arrow because they go somewhere. */}
              <span
                className={s.idleCount}
                // "17×" is read out as "seventeen times" by nobody, so the
                // accessible name spells it out and the glyph is decoration.
                aria-label={`checked ${item.count} ${item.count === 1 ? "time" : "times"}`}
              >
                {item.count}
                <span className={s.idleCountMark} aria-hidden="true">
                  ×
                </span>
              </span>
            </button>
          ))
        ) : (
          recent.map((item) => (
            <a key={item.id} className={s.idleRow} href={`/r/${item.id}`}>
              <span className={s.idleRowIcon} aria-hidden="true">
                {item.inputKind === "url" ? <LinkIcon size={14} /> : <TextIcon size={14} />}
              </span>
              <span className={s.idleRowMain}>
                <span className={s.idleRowClaim}>{item.claim}</span>
                <span className={s.idleRowMeta}>
                  <span className={`${s.idleVerdict} ${LABEL_CLASS[item.label]}`}>
                    {item.label}
                  </span>{" "}
                  {item.truthScore}/100 · {item.effectiveWitnesses.toFixed(1)} of{" "}
                  {item.nominalAgree} witnesses survived · {ago(item.createdAt)}
                </span>
              </span>
              <span className={s.idleRowAction} aria-hidden="true">
                <ArrowRight size={14} />
              </span>
            </a>
          ))
        )}
      </div>

      <p className={s.idleFoot}>
        Every verification run here is stored and listed. Nothing you paste into this demo is
        private.
      </p>
    </aside>
  );
}

/**
 * Rendered on the client after mount, from data fetched at the same time, so
 * there is no server/client clock to disagree about.
 */
function ago(ms: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
