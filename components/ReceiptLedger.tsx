"use client";

import { useState } from "react";
import { labelFor } from "@/lib/models";
import type { ReceiptView } from "@/lib/types";
import s from "./quorum.module.css";

const PURPOSE_TITLE: Record<string, string> = {
  prep: "claim preparation",
  direct: "claim, as stated",
  mirror: "claim, negated (blind)",
  anchor: "evidence anchors",
  adjudicate: "closing adjudication",
};

/**
 * The proof surface. Every row is one inference that happened on a named node of
 * the Gonka Network, with the request id the brief asks us to display. Opening a
 * row shows exactly what was sent and exactly what came back, so a judge can
 * re-run any single step themselves against the same gateway.
 */
export function ReceiptLedger({ receipts }: { receipts: ReceiptView[] }) {
  const [open, setOpen] = useState<number | null>(null);

  if (receipts.length === 0) {
    return <p className={s.probeWaiting}>No inferences recorded yet.</p>;
  }

  return (
    <div className={s.ledger}>
      <div className={`${s.ledgerRow} ${s.ledgerHead}`} aria-hidden="true">
        <span>node</span>
        <span>gonka request id</span>
        <span>model</span>
        <span>step</span>
        <span>latency</span>
        <span>tokens</span>
      </div>

      {receipts.map((receipt, index) => (
        <div key={`${receipt.requestId}-${index}`}>
          <button
            type="button"
            className={`${s.ledgerRow} ${receipt.status === "error" ? s.rowFailed : ""}`}
            onClick={() => setOpen(open === index ? null : index)}
            aria-expanded={open === index}
          >
            <span className={s.node}>{receipt.devshardId || "—"}</span>
            <span className={s.reqId}>
              {receipt.requestId || (receipt.status === "error" ? "no response" : "—")}
            </span>
            <span className={s.dim}>{labelFor(receipt.model)}</span>
            <span className={s.dim}>{PURPOSE_TITLE[receipt.purpose] ?? receipt.purpose}</span>
            <span className={s.dim}>{(receipt.latencyMs / 1000).toFixed(1)}s</span>
            <span className={s.dim}>{receipt.totalTokens || "—"}</span>
          </button>

          {open === index ? (
            <div className={s.detail}>
              <div className={s.detailBlock}>
                <span className={s.detailLabel}>
                  served by node {receipt.devshardId || "unknown"} · engine{" "}
                  {receipt.systemFingerprint || "unreported"} · finish {receipt.finishReason || "—"}
                  {receipt.attempts > 1 ? ` · sent ${receipt.attempts}× (gateway congestion)` : ""}
                  {receipt.error ? ` · ${receipt.error}` : ""}
                </span>
                <CopyButton value={receipt.requestId} />
              </div>
              <div className={s.detailBlock}>
                <span className={s.detailLabel}>request sent to gonkarouter.io</span>
                <pre className={s.pre}>{receipt.requestBody}</pre>
              </div>
              <div className={s.detailBlock}>
                <span className={s.detailLabel}>raw response from the node</span>
                <pre className={s.pre}>{receipt.rawResponse || "(empty)"}</pre>
              </div>
              {receipt.reasoning ? (
                <div className={s.detailBlock}>
                  <span className={s.detailLabel}>the node&apos;s own reasoning trace</span>
                  <pre className={s.pre}>{receipt.reasoning}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      className={s.copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "copied" : "copy request id"}
    </button>
  );
}
