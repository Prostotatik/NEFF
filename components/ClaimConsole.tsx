"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CALLS_PER_RUN, PANEL } from "@/lib/models";
import type { ClaimPrep, ProbeResult, ReceiptView, RunEvent, VerificationRun } from "@/lib/types";
import { Report } from "./Report";
import { Mechanism } from "./Mechanism";
import { DetailsRail, OrbitalStage, type PanelStatus } from "./RunHero";
import { IdleRail } from "./IdleRail";
import { ArrowRight, ImageIcon, LinkIcon, TextIcon, XIcon } from "./Icons";
import s from "./neff.module.css";

/**
 * The examples are ordered by how sharply each one exercises the mechanism, not
 * by topic. The first two have repeatedly produced a high nominal consensus next
 * to a low witness count; the third and fourth are here precisely because they
 * do not always, and a metric that only ever says "echo" would be worthless.
 *
 * The reference renders this row as icon buttons, so each example carries the
 * icon for the kind of input it is — a post, a link, a plain sentence, the text
 * lifted off a screenshot.
 */
const EXAMPLES: Array<{
  label: string;
  input: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  {
    label: "a post: vitamin C prevents colds",
    input: "Taking vitamin C supplements prevents the common cold.",
    icon: XIcon,
  },
  {
    label: "a linked article",
    input: "https://en.wikipedia.org/wiki/Streisand_effect",
    icon: LinkIcon,
  },
  {
    label: "a claim: the Great Wall from the Moon",
    input: "The Great Wall of China is visible from the Moon with the naked eye.",
    icon: TextIcon,
  },
  {
    label: "text off a screenshot: Norway's fund owns 1.5% of listed shares",
    input: "Norway's sovereign wealth fund owns roughly 1.5% of all listed companies worldwide.",
    icon: ImageIcon,
  },
];

const PROBE_TITLE: Record<ProbeResult["kind"], string> = {
  direct: "the claim",
  mirror: "its negation",
  anchor: "the evidence",
};

/** Stances are coloured so the echo pattern forms visibly as cells land. */
const STANCE_TONE: Record<string, string> = {
  SUPPORTED: s.toneSupported,
  REFUTED: s.toneRefuted,
  UNCERTAIN: s.toneUncertain,
};

export function ClaimConsole() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<{ stage: string; detail: string } | null>(null);
  const [prep, setPrep] = useState<ClaimPrep | null>(null);
  const [probes, setProbes] = useState<ProbeResult[]>([]);
  const [receipts, setReceipts] = useState<ReceiptView[]>([]);
  const [run, setRun] = useState<VerificationRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PanelStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // `running` in state drives the UI; the ref is what guards re-entry, because
  // the state value captured in this callback is a render behind.
  const runningRef = useRef(false);

  // Idle means nothing has been asked yet: no run in flight, no probes back, no
  // report on screen. An error is still idle — the claim was not verified, so
  // there is no verification to detail.
  const idle = !running && !run && probes.length === 0;

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: PanelStatus) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ ok: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback(
    async (value: string) => {
      const claim = value.trim();
      if (claim.length < 8 || runningRef.current) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      runningRef.current = true;

      setRunning(true);
      setError(null);
      setRun(null);
      setPrep(null);
      setProbes([]);
      setReceipts([]);
      setStage({ stage: "open", detail: "Opening a channel to the Gonka Router" });

      try {
        const response = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: claim }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(detail?.error ?? "The verification service did not accept that input.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          buffer += decoder.decode(chunk, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");
            if (!frame.startsWith("data: ")) continue;
            let event: RunEvent;
            try {
              event = JSON.parse(frame.slice(6)) as RunEvent;
            } catch {
              continue;
            }
            applyEvent(event);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Something went wrong during verification.");
        }
      } finally {
        // Only the run that still owns the abort controller may clear the
        // running flag. Without this, an aborted run's teardown re-enables the
        // button underneath the run that replaced it, and a third click opens a
        // third concurrent stream.
        if (abortRef.current === controller) {
          runningRef.current = false;
          setRunning(false);
          setStage(null);
        }
      }

      function applyEvent(event: RunEvent) {
        switch (event.type) {
          case "stage":
            setStage({ stage: event.stage, detail: event.detail });
            break;
          case "prep":
            setPrep(event.prep);
            break;
          case "probe":
            setProbes((current) => [...current, event.probe]);
            break;
          case "receipt":
            setReceipts((current) => [...current, event.receipt]);
            break;
          case "done":
            setRun(event.run);
            break;
          case "error":
            setError(event.message);
            break;
        }
      }
    },
    // Nothing in this callback reads state that changes between runs — re-entry
    // is guarded by runningRef — so it never needs to be rebuilt.
    [],
  );

  return (
    <>
      {/* --- S7 | S1 | S6 : the hero band ------------------------------- */}
      <div className={s.hero}>
        <div className={s.heroLeft}>
          <h1 className={s.thesis}>
            <span className={s.thesisOne}>Decentralized.</span>
            <span className={s.thesisTwo}>Verified.</span>
            <span className={s.thesisThree}>Unbiased.</span>
          </h1>
          <div className={s.scanbar} aria-hidden="true" />
          <form
            className={s.console}
            onSubmit={(e) => {
              e.preventDefault();
              void start(input);
            }}
          >
            <div className={s.field}>
              <textarea
                ref={inputRef}
                className={s.input}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="link, tweet, or claim to verify…"
                spellCheck={false}
                disabled={running}
                aria-label="Claim, post text, or link to verify"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void start(input);
                  }
                }}
              />
              <button
                className={s.submit}
                type="submit"
                disabled={running || input.trim().length < 8}
                aria-label={running ? "Verifying" : "Verify"}
              >
                {running ? (
                  <span className={s.submitSpin} aria-hidden="true" />
                ) : (
                  <ArrowRight size={19} />
                )}
              </button>
            </div>

            <div className={s.examples}>
              <span className={s.examplesLabel}>Example:</span>
              {EXAMPLES.map((example) => {
                const Icon = example.icon;
                return (
                  <button
                    key={example.input}
                    type="button"
                    className={s.exampleChip}
                    disabled={running}
                    title={example.label}
                    onClick={() => {
                      setInput(example.input);
                      void start(example.input);
                    }}
                  >
                    <Icon size={15} />
                    <span className={s.exampleName}>{example.label}</span>
                  </button>
                );
              })}
            </div>

            {error ? <p className={s.error}>{error}</p> : null}
          </form>

          {/* The pitch, verbatim. The reference has no paragraph in this column,
              so it sits under the console at label size rather than competing
              with the headline. */}
          <p className={s.subthesis}>
            Three models agreeing is one witness if they all read the same page — NEFF measures
            how independent its verifiers actually are and prices the truth score by it.
          </p>
        </div>

        <OrbitalStage run={run} probes={probes} running={running} status={status} />

        {/* Before anything has been asked there is no verification to detail, so
            the rail shows what has actually been checked here instead of a
            report shell with every field reading "—". The moment a run starts,
            the details panel takes the slot back. */}
        {idle ? (
          <IdleRail
            onPick={(value) => {
              setInput(value);
              // Deliberately not submitted. Eleven inferences are spent on the
              // user's say-so, not on a click that was meant to read something.
              inputRef.current?.focus();
            }}
          />
        ) : (
          <DetailsRail run={run} receipts={receipts} running={running} status={status} />
        )}
      </div>

      {/* --- S2 : the probe cards --------------------------------------- */}
      {/* The three probe cards explain the mechanism to someone who has not run
          anything yet. Once a claim is in flight they are the wrong thing on the
          page — the reader wants the run, not the explanation of it — so they
          fold away rather than vanishing, and fold back if the run never starts
          (a rejected input leaves the page idle again). */}
      <div
        className={`${s.mechanismFold} ${idle ? "" : s.mechanismFolded}`}
        aria-hidden={!idle}
      >
        <div className={s.mechanismFoldInner}>
          <Mechanism />
        </div>
      </div>

      {(running || (probes.length > 0 && !run)) && !error ? (
        <LiveRun stage={stage} prep={prep} probes={probes} receipts={receipts} />
      ) : null}

      {run ? (
        <>
          <Report run={run} />
          <p>
            <a className={s.permalink} href={`/r/${run.id}`}>
              permanent link to this report → /r/{run.id}
            </a>
          </p>
        </>
      ) : (
        <Provenance />
      )}
    </>
  );
}

function Provenance() {
  return (
    <p className={s.provenance}>
      The correction is standard — Kish&apos;s effective sample size, applied to an LLM panel in{" "}
      <a href="https://arxiv.org/abs/2605.29800" target="_blank" rel="noreferrer noopener">
        Nine Judges, Two Effective Votes
      </a>
      , which measures nine judges as worth about two independent votes. What is new here is
      measuring that overlap per claim, from the models&apos; own stated evidence, and putting the
      result in front of you as part of the verdict.
    </p>
  );
}

/**
 * What a judge watches while eleven inferences land from independent nodes.
 * Deliberately not a spinner: the grid fills in cell by cell, out of order,
 * because that out-of-order arrival is the decentralisation made visible.
 */
function LiveRun({
  stage,
  prep,
  probes,
  receipts,
}: {
  stage: { stage: string; detail: string } | null;
  prep: ClaimPrep | null;
  probes: ProbeResult[];
  receipts: ReceiptView[];
}) {
  const kinds: ProbeResult["kind"][] = ["direct", "mirror", "anchor"];
  const landed = (modelId: string, kind: ProbeResult["kind"]) =>
    probes.find((p) => p.modelId === modelId && p.kind === kind);

  return (
    <div className={s.live}>
      {stage ? (
        <div className={s.stageLine}>
          <span className={s.liveDot} aria-hidden="true" />
          <span>{stage.detail}</span>
          <span className={s.dim}>
            · {receipts.length} of {CALLS_PER_RUN} inferences returned
          </span>
        </div>
      ) : null}

      {/* One row per model, one column per probe. Exactly nine cells, so nothing
          wraps into a ragged tail — and a row that answers the same way twice is
          the echo, visible as it lands. */}
      <div className={s.probeGrid}>
        <div className={`${s.probeCell} ${s.probeHeadCell}`} aria-hidden="true" />
        {kinds.map((kind) => (
          <div key={kind} className={`${s.probeCell} ${s.probeHeadCell}`}>
            <span className={s.probeColumn}>{PROBE_TITLE[kind]}</span>
          </div>
        ))}

        {PANEL.map((model) => (
          <Fragment key={model.id}>
            <div className={`${s.probeCell} ${s.probeHeadCell}`}>
              <span className={s.probeModel}>{model.label}</span>
            </div>
            {kinds.map((kind) => {
              const probe = landed(model.id, kind);
              return (
                <div key={kind} className={s.probeCell}>
                  {probe ? (
                    <div className={`${s.probeBody} ${probe.stance ? STANCE_TONE[probe.stance] : ""}`}>
                      {probe.status === "failed"
                        ? "no answer"
                        : kind === "anchor"
                          ? (probe.anchors ?? []).length > 0
                            ? `${(probe.anchors ?? []).length} named`
                            : "named none"
                          : probe.stance}
                    </div>
                  ) : (
                    <>
                      <div className={s.shimmer} aria-hidden="true" />
                      <span className={s.probeWaiting}>awaiting node…</span>
                    </>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {prep ? <p className={s.liveClaim}>{prep.claim}</p> : null}
    </div>
  );
}
