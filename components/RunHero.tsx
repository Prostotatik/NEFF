"use client";

import { useState } from "react";
import { PANEL } from "@/lib/models";
import type { ProbeResult, ReceiptView, VerificationRun } from "@/lib/types";
import { OrbitTrails, SatelliteOrb, Shard, StarField, VerdictOrb } from "./Orbs";
import { ArrowRight, Copy, ShieldCheck } from "./Icons";
import { avatarStyle, hueFor } from "./palette";
import s from "./quorum.module.css";

export interface PanelStatus {
  ok: boolean;
  panel?: Array<{ id: string; label: string; online: boolean }>;
}

/** Where each satellite sits around the central orb, in reference order. */
const SAT_SLOT = [s.satTopLeft, s.satTopRight, s.satBottomRight];
const SAT_TILT = [18, -22, -8];

/**
 * S1 — the orbital scene. The centre carries the truth score and the satellites
 * carry the panel, one orb per model in its own colour.
 *
 * Before a run there is nothing measured to show, so the centre says so rather
 * than displaying a placeholder number: an invented score on the hero would be
 * exactly the thing this project exists to argue against.
 */
export function OrbitalStage({
  run,
  probes,
  running,
  status,
}: {
  run: VerificationRun | null;
  probes: ProbeResult[];
  running: boolean;
  status: PanelStatus | null;
}) {
  const score = run?.verdict.truthScore;
  // The orb is brand green whatever the verdict. The reference's orb is green at
  // 23%, and recolouring it by score would put a third colour into a system where
  // colour already means something specific — steel for the nominal reading,
  // sodium for the effective one.
  const orbHue = "#00ffa3";

  return (
    <div className={s.stage}>
      <div className={s.stageInner}>
        <StarField />
        <OrbitTrails />

        <div className={s.orbHolder}>
        <VerdictOrb size={318} hue={orbHue} idle={!run}>
          {run ? (
            <>
              <span className={s.orbCaption}>Overall truth score</span>
              <span className={s.orbScore}>{score}%</span>
              <span className={s.orbLabel}>{run.verdict.label}</span>
            </>
          ) : running ? (
            <>
              <span className={s.orbCaption}>Probing the panel</span>
              <span className={s.orbScore}>{probes.length}</span>
              <span className={s.orbHint}>
                of {PANEL.length * 3} probes returned from Gonka nodes
              </span>
            </>
          ) : (
            <>
              <span className={s.orbCaption}>Overall truth score</span>
              <span className={s.orbLabel}>Awaiting a claim</span>
              <span className={s.orbHint}>
                Nothing has been measured yet, so nothing is shown.
              </span>
            </>
          )}
        </VerdictOrb>
        </div>

        {PANEL.map((model, i) => {
          const witness = run?.witnesses.find((w) => w.modelId === model.id);
          const landed = probes.filter((p) => p.modelId === model.id).length;
          const online = status?.panel?.find((p) => p.id === model.id)?.online ?? true;
          const hue = hueFor(model.id);
          const [name, version] = splitLabel(model.label);

          return (
            <div key={model.id} className={`${s.satWrap} ${SAT_SLOT[i] ?? ""}`}>
              <SatelliteOrb
                size={i === 1 ? 112 : 96}
                hue={hue}
                tilt={SAT_TILT[i] ?? -20}
                seed={i + 3}
                dim={Boolean(run) && !witness?.stance}
              />
              <div className={s.satLabel}>
                <span className={s.satName}>{name}</span>
                <span className={s.satName}>{version}</span>
                {run ? (
                  witness?.stance ? (
                    <>
                      <span className={s.satEyebrow}>self-reported</span>
                      <span className={s.satValue}>{Math.round(witness.confidence * 100)}%</span>
                      <span className={s.satStance}>{titleCase(witness.stance)}</span>
                    </>
                  ) : (
                    <>
                      <span className={s.satEyebrow}>self-reported</span>
                      <span className={s.satValue}>—</span>
                      <span className={`${s.satStance} ${s.satStanceDim}`}>No answer</span>
                    </>
                  )
                ) : running ? (
                  <>
                    <span className={s.satEyebrow}>probes back</span>
                    <span className={s.satValue}>{landed}/3</span>
                    <span className={`${s.satStance} ${s.satStanceDim}`}>Working</span>
                  </>
                ) : (
                  <>
                    <span className={s.satEyebrow}>on the router</span>
                    <span className={`${s.satStance} ${online ? "" : s.satStanceDim}`}>
                      {online ? "Standing by" : "Unreachable"}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}

        <Shard size={46} hue="#00ffa3" className={s.shardOne} />
        <Shard size={34} hue="#72dcff" className={s.shardTwo} />

        <span className={s.stagePill}>
          <span className={s.liveDot} aria-hidden="true" />
          {run
            ? `Generated on Gonka Network · ${run.totals.calls} inferences`
            : "Generated on Gonka Network"}
        </span>
      </div>
    </div>
  );
}

/**
 * S6 — the verification details rail. Everything in it is provenance: which
 * claim, when, on which models, and the Gonka request id of every inference, so
 * a reader can take any line of it back to the router.
 */
export function DetailsRail({
  run,
  receipts,
  running,
  status,
}: {
  run: VerificationRun | null;
  receipts: ReceiptView[];
  running: boolean;
  status: PanelStatus | null;
}) {
  const live = run?.receipts ?? receipts;
  const ids = live.map((r) => ({ id: r.requestId, model: r.model })).filter((r) => r.id);
  const shown = ids.slice(0, 3);
  const rest = ids.length - shown.length;

  return (
    <aside className={s.rail}>
      <div className={s.railHead}>
        <ShieldCheck size={20} />
        Verification Details
      </div>

      <div className={s.railGroup}>
        <span className={s.railLabel}>Claim ID</span>
        <span className={`${s.railValue} ${s.railValueMono}`}>
          {run ? run.id : running ? "assigning…" : "—"}
          {run ? <CopyChip value={run.id} /> : null}
        </span>
      </div>

      <div className={s.railGroup}>
        <span className={s.railLabel}>Timestamp</span>
        <span className={s.railValue}>{run ? stamp(run.createdAt) : "—"}</span>
      </div>

      <div className={s.railGroup}>
        <span className={s.railLabel}>
          Models Used
          <CopyChip value={PANEL.map((m) => m.id).join("\n")} />
        </span>
        <span className={s.railAvatars}>
          {PANEL.map((model) => {
            const online = status?.panel?.find((p) => p.id === model.id)?.online ?? true;
            return (
              <span
                key={model.id}
                className={s.avatar}
                style={{ ...avatarStyle(model.id), opacity: online ? 1 : 0.4 }}
                title={model.id}
              >
                {model.sigil}
              </span>
            );
          })}
        </span>
      </div>

      <div className={s.railGroup}>
        <span className={s.railRow}>
          <span className={s.railLabel}>Total Inferences</span>
          <span className={s.railValue}>{run ? run.totals.calls : live.length || "—"}</span>
        </span>
      </div>

      <div className={`${s.railGroup} ${s.railGroupLast}`}>
        <span className={s.railLabel}>Gonka Request IDs</span>
        <span className={s.railIds}>
          {shown.length > 0 ? (
            shown.map((r, i) => (
              <span key={`${r.id}-${i}`} className={s.railId}>
                <span
                  className={s.railIdDot}
                  style={{
                    background: hueFor(r.model),
                    boxShadow: `0 0 7px ${hueFor(r.model)}`,
                  }}
                />
                {shorten(r.id)}
              </span>
            ))
          ) : (
            <span className={s.railMore}>none yet</span>
          )}
          {rest > 0 ? <span className={s.railMore}>+ {rest} more</span> : null}
        </span>
      </div>

      {run ? (
        <a className={s.railButton} href={`/r/${run.id}`}>
          View Full Report
          <ArrowRight size={17} />
        </a>
      ) : (
        <span className={s.railButton} aria-disabled="true">
          {running ? "Verification in progress" : "No verification yet"}
          <ArrowRight size={17} />
        </span>
      )}
    </aside>
  );
}

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={s.railCopy}
      title={copied ? "copied" : "copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Copy size={15} />
    </button>
  );
}

/** "DeepSeek V4 Flash" → ["DeepSeek", "V4 Flash"], as the reference stacks it. */
function splitLabel(label: string): [string, string] {
  const parts = label.split(" ");
  return [parts[0], parts.slice(1).join(" ")];
}

function titleCase(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

function shorten(id: string): string {
  return id.length > 17 ? `${id.slice(0, 9)}…${id.slice(-4)}` : id;
}

function stamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");
}
