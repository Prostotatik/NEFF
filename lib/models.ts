/**
 * The panel: every model NEFF uses as a witness, all hosted on the Gonka Network.
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
   * Per-call ceiling in ms. Measured, not guessed. Two failure modes pull in
   * opposite directions: too short and a slow node drops out of every run,
   * silently costing the panel a witness; too long and one hung call holds the
   * whole verification open. Observed: an individual probe occasionally hangs
   * well past its normal latency, so these are set near the slowest *healthy*
   * response for each model rather than at the worst case.
   */
  timeoutMs: number;
  /**
   * Ceiling on the first send only.
   *
   * The router's cold latency has a very long tail — MiniMax measured at 5.3,
   * 6.4, 12.1, 13.2, 22.6, 41.7, 44.6, 47.2 and 64.0 seconds on ten
   * cache-busted probes — but it finishes the generation whether or not the
   * client is still waiting, and hands the result to the next identical
   * request. Cutting the first send short and asking again therefore beats
   * waiting: four probes cut off at 4s came back on the re-send in 1.5s, 7.1s,
   * 9.6s and 15.1s. These values sit above the median cold response and well
   * below the tail, so a normal probe is never cut and a stalled one is
   * abandoned early enough for the second ask to fit inside the phase budget.
   */
  firstAttemptMs: number;
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
    timeoutMs: 45_000,
    firstAttemptMs: 14_000,
    maxTokens: 1400,
  },
  {
    id: "MiniMaxAI/MiniMax-M2.7",
    label: "MiniMax M2.7",
    house: "MiniMaxAI",
    sigil: "MM",
    timeoutMs: 70_000,
    firstAttemptMs: 18_000,
    maxTokens: 3200,
  },
  {
    id: "moonshotai/Kimi-K2.6",
    label: "Kimi K2.6",
    house: "moonshotai",
    sigil: "KM",
    timeoutMs: 60_000,
    firstAttemptMs: 20_000,
    maxTokens: 2000,
    chatTemplateKwargs: { thinking: false },
  },
];

/**
 * The model that reduces raw input to one checkable claim. DeepSeek writes the
 * shortest output of the three and is quick on it.
 */
export const ADJUDICATOR = PANEL[0];

/**
 * Who writes the closing note, in the order they are asked.
 *
 * Not the same choice as claim preparation, and measured rather than assumed.
 * Three cold adjudication-shaped calls per model, unique nonce so none could be
 * a cache hit:
 *
 *   DeepSeek V4 Flash   21.2s, 15.7s, 19.2s   (163–202 completion tokens)
 *   MiniMax M2.7        11.7s,  7.8s,  7.1s   (557–1247 tokens)
 *   Kimi K2.6            5.9s,  6.4s, 28.8s   (475–538 tokens)
 *
 * DeepSeek is the slowest of the three on this prompt by a wide margin — about
 * ten tokens a second against MiniMax's eighty — and it was first in this list,
 * which is why every run of a four-claim suite spent its adjudication budget
 * timing out before failing over. MiniMax leads now because it is both quick and
 * the most consistent; Kimi is second on its median, and DeepSeek last.
 */
export const CLOSING_ORDER: PanelModel[] = [PANEL[1], PANEL[2], PANEL[0]];

/**
 * Inferences in a nominal run: one claim preparation, three probes per model,
 * one closing adjudication. A run can exceed this if the adjudicator has to be
 * failed over to another node, which the receipt ledger shows.
 */
export const CALLS_PER_RUN = 1 + PANEL.length * 3 + 1;

export function modelByHouse(id: string): PanelModel | undefined {
  return PANEL.find((m) => m.id === id);
}

export function labelFor(id: string): string {
  return modelByHouse(id)?.label ?? id;
}
