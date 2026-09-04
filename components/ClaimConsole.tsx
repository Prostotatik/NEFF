"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CALLS_PER_RUN, PANEL, labelFor } from "@/lib/models";
import type { ClaimPrep, ProbeResult, ReceiptView, RunEvent, VerificationRun } from "@/lib/types";
import { Report } from "./Report";
import s from "./quorum.module.css";

/**
 * The examples are ordered by how sharply each one exercises the mechanism, not
 * by topic. The first two have repeatedly produced a high nominal consensus next
 * to a low witness count; the third and fourth are here precisely because they
 * do not always, and a metric that only ever says "echo" would be worthless.
 */
const EXAMPLES: Array<{ label: string; input: string }> = [
  { label: "vitamin C prevents colds", input: "Taking vitamin C supplements prevents the common cold." },
  { label: "a linked article", input: "https://en.wikipedia.org/wiki/Streisand_effect" },
  { label: "the Great Wall from the Moon", input: "The Great Wall of China is visible from the Moon with the naked eye." },
  { label: "Norway's fund owns 1.5% of listed shares", input: "Norway's sovereign wealth fund owns roughly 1.5% of all listed companies worldwide." },
];

const PROBE_TITLE: Record<ProbeResult["kind"], string> = {
  direct: "claim",
  mirror: "mirror",
  anchor: "evidence",
};

interface PanelStatus {
  ok: boolean;
  panel?: Array<{ id: string; label: string; online: boolean }>;
}

export function ClaimConsole() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<{ stage: string; detail: string } | null>(null);
  const [prep, setPrep] = useState<ClaimPrep | null>(null);
  const [probes, setProbes] = useState<ProbeResult[]>([]);
  const [receipts, setReceipts] = useState<ReceiptView[]>([]);
  const [run, setRun] = useState<VerificationRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // `running` in state drives the UI; the ref is what guards re-entry, because
  // the state value captured in this callback is a render behind.
  const runningRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), []);

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

  const engaged = running || Boolean(run) || probes.length > 0;

  return (
    <>
      <header className={`${s.hero} ${engaged ? s.heroCompact : ""}`}>
        <p className="eyebrow">
          Independence-weighted fact verification · every inference on Gonka
        </p>
        <h1 className={s.thesis}>
          Three models agreeing is <em>one witness</em> if they all read the same page.
        </h1>
        <p className={s.subthesis}>
          Quorum does not count votes. It probes each model with the claim, with the claim negated,
          and with a demand for its sources — then reports how many genuinely independent witnesses
          are behind the verdict, and discounts the truth score by it.
        </p>
      </header>

      <form
        className={s.console}
        onSubmit={(e) => {
          e.preventDefault();
          void start(input);
        }}
      >
        <div className={s.field}>
          <textarea
            className={s.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a claim, the text of a post, or a link to an article…"
            spellCheck={false}
            disabled={running}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void start(input);
              }
            }}
          />
          <button className={s.submit} type="submit" disabled={running || input.trim().length < 8}>
            {running ? "Verifying…" : "Verify"}
          </button>
        </div>

        <div className={s.examples}>
          <span className={s.examplesLabel}>Try</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.input}
              type="button"
              className={s.example}
              disabled={running}
              onClick={() => {
                setInput(example.input);
                void start(example.input);
              }}
            >
              {example.label}
            </button>
          ))}
        </div>

        {error ? <p className={s.error}>{error}</p> : null}
      </form>

      <PanelStatus />

      {!engaged ? <Mechanism /> : null}

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
      ) : null}
    </>
  );
}

/**
 * The mechanism, on the landing page only. A visitor who never runs a check
 * should still leave knowing what is different about this one, and a visitor who
 * does run one wants the screen back.
 */
function Mechanism() {
  return (
    <>
      <div className={s.mechanism}>
        <div className={s.step}>
          <span className={s.stepIndex}>probe 01 · the claim</span>
          <h2 className={s.stepTitle}>What do you think?</h2>
          <p className={s.stepBody}>
            Every model on the panel assesses the claim and names the evidence it is leaning on.
            This is the part every other fact checker stops at.
          </p>
        </div>
        <div className={s.step}>
          <span className={s.stepIndex}>probe 02 · the mirror</span>
          <h2 className={s.stepTitle}>And the opposite?</h2>
          <p className={s.stepBody}>
            The claim is negated and put to each model again, blind, in a fresh request. A model that
            answers both the same way is reading the sentence, not the fact — and its vote is thrown
            out, with both answers shown.
          </p>
        </div>
        <div className={s.step}>
          <span className={s.stepIndex}>probe 03 · the evidence</span>
          <h2 className={s.stepTitle}>Says who?</h2>
          <p className={s.stepBody}>
            Models converging on one source are one witness, not three. The overlap is measured and
            the truth score is discounted by it — so a unanimous panel can be worth 1.1 witnesses,
            and the report says so.
          </p>
        </div>
      </div>
      <p className={s.provenance}>
        The correction is standard — Kish&apos;s effective sample size, applied to an LLM panel in{" "}
        <a
          href="https://arxiv.org/abs/2605.29800"
          target="_blank"
          rel="noreferrer noopener"
        >
          Nine Judges, Two Effective Votes
        </a>
        , which measures nine judges as worth about two independent votes. What is new here is
        measuring that overlap per claim, from the models&apos; own stated evidence, and putting the
        result in front of you as part of the verdict.
      </p>
    </>
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
          <span className={s.stageDot} aria-hidden="true" />
          <span>{stage.detail}</span>
          <span className={s.dim}>
            · {receipts.length} of {CALLS_PER_RUN} inferences returned
          </span>
        </div>
      ) : null}

      {prep ? <p className={s.claim}>{prep.claim}</p> : null}

      <div className={s.probeGrid}>
        {PANEL.flatMap((model) =>
          kinds.map((kind) => {
            const probe = landed(model.id, kind);
            return (
              <div
                key={`${model.id}-${kind}`}
                className={`${s.probeCell} ${probe ? "" : s.probeCellPending}`}
              >
                <div className={s.probeHead}>
                  <span>{labelFor(model.id)}</span>
                  <span>{PROBE_TITLE[kind]}</span>
                </div>
                {probe ? (
                  <div className={s.probeBody}>
                    {probe.status === "failed"
                      ? "no answer"
                      : kind === "anchor"
                        ? (probe.anchors ?? []).length > 0
                          ? `${(probe.anchors ?? []).length} source${(probe.anchors ?? []).length === 1 ? "" : "s"} named`
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
          }),
        )}
      </div>
    </div>
  );
}

/** Live confirmation that the panel is reachable on the Gonka Network. */
function PanelStatus() {
  const [status, setStatus] = useState<PanelStatus | null>(null);

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

  return (
    <div className={s.status}>
      <span>gonkarouter.io</span>
      {status?.panel
        ? status.panel.map((model) => (
            <span key={model.id} className={s.statusNode}>
              <span className={`${s.dot} ${model.online ? s.dotOn : s.dotOff}`} />
              {model.label}
            </span>
          ))
        : PANEL.map((model) => (
            <span key={model.id} className={s.statusNode}>
              <span className={s.dot} />
              {model.label}
            </span>
          ))}
      {status && !status.ok ? <span>router unreachable</span> : null}
    </div>
  );
}
