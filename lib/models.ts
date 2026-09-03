/**
 * The panel: every model Quorum uses as a witness, all hosted on the Gonka Network.
 *
 * Short labels are what the UI shows; they need to fit in a column header and
 * still be recognisable to a judge who knows the model families.
 */

export interface PanelModel {
  /** Gonka Router model id, exactly as returned by GET /v1/models. */
  id: string;
  /** Display name in the panel. */
  label: string;
  /** Family, shown as the secondary line. */
  house: string;
  /** Two-letter sigil used in dense views. */
  sigil: string;
  /**
   * Per-call ceiling in ms. Measured, not guessed: Kimi-K2.6 is materially
   * slower than the other two and needs a longer leash or it drops out of every
   * run and silently costs us a witness.
   */
  timeoutMs: number;
  /**
   * Token ceiling per call. Chain of thought is billed against this on every
   * model in the panel — MiniMax emits it inline in a <think> block, Kimi
   * returns it in a separate `reasoning` field — so a budget sized for the
   * answer alone makes a reasoning model return nothing at all.
   */
  maxTokens: number;
  /**
   * Node-side chat template switches. Kimi-K2.6 defaults to emitting ~2000
   * tokens of chain of thought per probe at roughly 13 tokens/second, which puts
   * a single verification past four minutes; turning it off brings the same
   * probe back in seconds. The reasoning it does return is still recorded in the
   * receipt ledger.
   */
  chatTemplateKwargs?: Record<string, unknown>;
}

export const PANEL: PanelModel[] = [
  {
    id: "deepseek-ai/DeepSeek-V4-Flash-0731",
    label: "DeepSeek V4 Flash",
    house: "deepseek-ai",
    sigil: "DS",
    timeoutMs: 90_000,
    maxTokens: 1400,
  },
  {
    id: "MiniMaxAI/MiniMax-M2.7",
    label: "MiniMax M2.7",
    house: "MiniMaxAI",
    sigil: "MM",
    timeoutMs: 150_000,
    maxTokens: 3200,
  },
  {
    id: "moonshotai/Kimi-K2.6",
    label: "Kimi K2.6",
    house: "moonshotai",
    sigil: "KM",
    timeoutMs: 180_000,
    maxTokens: 2000,
    chatTemplateKwargs: { thinking: false },
  },
];

/** The model that writes the closing adjudication. Fastest of the panel. */
export const ADJUDICATOR = PANEL[0];

export function modelByHouse(id: string): PanelModel | undefined {
  return PANEL.find((m) => m.id === id);
}

export function labelFor(id: string): string {
  return modelByHouse(id)?.label ?? id;
}
