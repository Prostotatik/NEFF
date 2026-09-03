"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PANEL, labelFor } from "@/lib/models";
import type { ClaimPrep, ProbeResult, ReceiptView, RunEvent, VerificationRun } from "@/lib/types";
import { Report } from "./Report";
import s from "./quorum.module.css";

const EXAMPLES = [
  "Taking vitamin C supplements prevents the common cold.",
  "The Great Wall of China is visible from the Moon with the naked eye.",
  "Norway's sovereign wealth fund owns roughly 1.5% of all listed companies worldwide.",
  "https://en.wikipedia.org/wiki/Streisand_effect",
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

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(
    async (value: string) => {
      const claim = value.trim();
      if (claim.length < 8 || running) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

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
        setRunning(false);
        setStage(null);
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
    [running],
  );

  return (
    <>
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
            placeholder="Paste a claim, a tweet, or a link to an article…"
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
              key={example}
              type="button"
              className={s.example}
              disabled={running}
              onClick={() => {
                setInput(example);
                void start(example);
              }}
            >
              {example.startsWith("http") ? "a linked article" : shorten(example)}
            </button>
          ))}
        </div>

        {error ? <p className={s.error}>{error}</p> : null}
      </form>

      <PanelStatus />

      {running || (probes.length > 0 && !run) ? (
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

function shorten(text: string): string {
  return text.length > 46 ? `${text.slice(0, 44)}…` : text;
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
            · {receipts.length} of 11 inferences returned
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
