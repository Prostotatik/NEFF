/**
 * Per-model identity colour.
 *
 * The reference gives each model on the panel its own hue and then reuses it
 * everywhere that model appears — its orb, its avatar, its dot in the request-id
 * list, its name in the receipts ledger. That consistency is the point: a reader
 * can follow one model down the page by colour alone, without re-reading names.
 *
 * These are the extra accents from gonka-colors.md, not the brand green, with
 * one exception: the third seat on the panel carries the brand green itself.
 *
 * Note for anyone changing these: violet here is MiniMax's identity, reused down
 * the whole page to let a reader follow one model without re-reading names. Do
 * not spend it on anything else. The idle rail's verdict words used to, and it
 * made the landing page ambiguous — see `.idleVerdictNeutral`.
 */

import { PANEL } from "@/lib/models";

const HUES = ["#4da3ff", "#b57af8", "#00ffa3"] as const;

export function hueFor(modelId: string): string {
  const index = PANEL.findIndex((m) => m.id === modelId);
  return HUES[index >= 0 ? index % HUES.length : 0];
}

/** Avatar background for a model, as the reference's circular chips. */
export function avatarStyle(modelId: string): React.CSSProperties {
  const hue = hueFor(modelId);
  return {
    background: `linear-gradient(150deg, ${hue}, color-mix(in srgb, ${hue} 55%, #04150e))`,
    boxShadow: `0 0 12px color-mix(in srgb, ${hue} 40%, transparent)`,
  };
}
