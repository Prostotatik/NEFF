/**
 * The one and only place in Quorum that talks to an inference provider.
 *
 * Every AI call in this application goes through the Gonka Router
 * (https://api.gonkarouter.io/v1), as required by the challenge brief. There is
 * deliberately no abstraction over "providers" here: adding one would make it
 * possible for a future edit to route inference somewhere else without anyone
 * noticing, and the whole premise of the submission is that the reasoning is
 * verifiably decentralized.
 *
 * Server-only. `GONKA_API_KEY` must never be imported into a client component.
 */

import "server-only";

import { stripThinking } from "./parse.ts";

export const GONKA_BASE_URL =
  process.env.GONKA_BASE_URL?.replace(/\/+$/, "") || "https://api.gonkarouter.io/v1";

/** A single auditable inference on the Gonka Network. */
export interface GonkaReceipt {
  /** Gonka Router request id, from the `x-request-id` response header. */
  requestId: string;
  /** Id of the Gonka node (devshard) that actually served this inference. */
  devshardId: string;
  /** Completion id returned in the response body, e.g. `devshard-70853-397`. */
  completionId: string;
  model: string;
  /** Inference engine build reported by the serving node. */
  systemFingerprint: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string;
  /** What this call was for, e.g. `direct`, `mirror`, `anchor`. */
  purpose: string;
  /** How many times this call had to be sent before a node answered. */
  attempts: number;
  /** Exactly what we sent, so a judge can re-run it themselves. */
  request: {
    model: string;
    temperature: number;
    max_tokens: number;
    messages: ChatMessage[];
    chat_template_kwargs?: Record<string, unknown>;
  };
  /** The model's raw text, before any parsing. */
  rawResponse: string;
  /**
   * Chain of thought, when the node returns it in its own field rather than
   * inline. Kimi-K2.6 does this, and it is billed against max_tokens, which is
   * why a small budget makes it return an empty answer.
   */
  reasoning: string;
  status: "ok" | "error";
  error?: string;
  startedAt: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GonkaCallOptions {
  model: string;
  messages: ChatMessage[];
  purpose: string;
  temperature?: number;
  maxTokens?: number;
  /** Per-call ceiling. Kimi-K2.6 is measurably slow; a run must not hang on it. */
  timeoutMs?: number;
  /**
   * Ceiling on the *first* attempt only, when it should be shorter than the
   * per-call one.
   *
   * The router keeps generating after a client gives up and serves the finished
   * completion to the next identical request — measured: four probes cut off at
   * 4s came back on the immediate re-send in 1.5s, 7.1s, 9.6s and 15.1s, all
   * faster than a cold generation. So the cheapest way through the router's long
   * cold tail is to stop waiting sooner and ask again, not to wait longer. This
   * is the shorter first leash that makes room for that second ask inside the
   * same phase budget.
   */
  firstAttemptMs?: number;
  /** Sends, including the first. Only transient gateway failures are retried. */
  maxAttempts?: number;
  /**
   * Absolute wall-clock ceiling for the whole call, retries included. No attempt
   * is started after it, and every attempt's timeout is clipped to what is left.
   * Without it a retry would double a phase budget the caller had already sized.
   */
  deadline?: number;
  /**
   * Cancels the call, and any pending retry, when the caller goes away. A user
   * who navigates away mid-verification should stop costing inference.
   */
  signal?: AbortSignal;
  /**
   * Passed straight through to the serving node's chat template, for the
   * per-model switches vLLM exposes (Kimi-K2.6 takes `{ thinking: false }`).
   * Omitted from the request entirely when not set, so a node that does not
   * understand the field never sees it.
   */
  chatTemplateKwargs?: Record<string, unknown>;
}

export interface GonkaCallResult {
  text: string;
  receipt: GonkaReceipt;
}

export class GonkaError extends Error {
  readonly receipt: GonkaReceipt;
  /** True when the gateway was busy rather than the request being wrong. */
  readonly retryable: boolean;
  /**
   * True when the node hit its token ceiling without reaching an answer. Retrying
   * this one unchanged is pointless — the router caches completions, so the same
   * body returns the same truncated text — so the retry has to raise the budget,
   * which also changes the request and so misses the poisoned cache entry.
   */
  readonly truncated: boolean;
  /** True when this attempt hit its own clock rather than failing outright. */
  readonly timedOut: boolean;
  /**
   * How long to wait before asking again, when the gateway said. A rate limit is
   * a time window rather than a blip: three retries a second apart all land
   * inside the same window and all fail, which is how a whole run can be lost in
   * three seconds to a limit that would have cleared on its own.
   */
  readonly retryAfterMs: number;

  constructor(
    message: string,
    receipt: GonkaReceipt,
    retryable = false,
    flags: { truncated?: boolean; timedOut?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "GonkaError";
    this.receipt = receipt;
    this.retryable = retryable;
    this.truncated = flags.truncated ?? false;
    this.timedOut = flags.timedOut ?? false;
    this.retryAfterMs = flags.retryAfterMs ?? 0;
  }
}

function apiKey(): string {
  const key = process.env.GONKA_API_KEY;
  if (!key || key.startsWith("sk-your-gonka")) {
    throw new Error(
      "GONKA_API_KEY is not configured. Copy .env.example to .env and add your Gonka Router key.",
    );
  }
  return key;
}

/**
 * Redact anything that looks like an API key before it can reach a log line,
 * an error message, or the browser. Cheap insurance: the key must never leave
 * the server, and error paths are where secrets usually escape.
 */
export function redact(text: string): string {
  return text.replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-***redacted***");
}

/** HTTP statuses that mean "the gateway was busy", not "your request is wrong". */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How long to wait after a rejected request, in milliseconds. Honours the
 * gateway's own `Retry-After` when it sends one (seconds, or an HTTP date), and
 * otherwise backs a 429 off far harder than a generic blip — measured: a burst
 * that trips the router's limit gets 429 on all three attempts inside three
 * seconds under the old 700ms base, losing every probe in the run to a limit
 * that clears on its own. Capped so it can never eat a whole phase budget.
 */
const MAX_BACKOFF_MS = 9_000;

function retryAfterFrom(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_BACKOFF_MS);
    }
    const at = Date.parse(header);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), MAX_BACKOFF_MS);
  }
  if (response.status !== 429) return 0;
  return Math.min(2_500 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

/** No attempt is worth starting with less than this much of the budget left. */
const MIN_ATTEMPT_MS = 4_000;

/** Ceiling on the escalated budget a truncation retry may ask for. */
const MAX_TOKEN_BUDGET = 8_000;

/**
 * One inference on the Gonka Network, retried through transient gateway
 * congestion.
 *
 * A verification fires nine probes at once, and the router answers a burst that
 * size with 429s and Cloudflare 524s often enough that without this the panel
 * loses witnesses to queueing rather than to anything about the claim. Retries
 * are counted on the receipt so the ledger stays honest about what it took.
 *
 * Three failures are worth another send, and they need different retries:
 * congestion wants backoff, a timeout wants no backoff at all (the answer is
 * already waiting), and a truncation wants a bigger token budget.
 */
export async function gonkaChat(options: GonkaCallOptions): Promise<GonkaCallResult> {
  const {
    maxAttempts = 3,
    signal,
    timeoutMs = 120_000,
    firstAttemptMs,
    deadline,
    maxTokens = 1200,
  } = options;
  // Resolved before the loop: a misconfigured key is not a transient failure and
  // must not be retried three times with backoff before saying so.
  const key = apiKey();
  let lastError: GonkaError | null = null;
  let tokenBudget = maxTokens;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) break;
    const remaining = deadline ? deadline - Date.now() : Number.POSITIVE_INFINITY;
    if (remaining < MIN_ATTEMPT_MS) break;
    // Ask quickly, then ask quickly again, and only wait properly on the last
    // try. A cut-off request leaves the router finishing the generation, so the
    // second ask is usually answered from that in a few seconds; spending the
    // whole leash on the first ask buys nothing and costs the phase its budget.
    const ceiling = attempt < maxAttempts ? (firstAttemptMs ?? timeoutMs) : timeoutMs;
    const attemptTimeout = Math.min(ceiling, remaining);

    try {
      return await attemptChat(
        { ...options, timeoutMs: attemptTimeout, maxTokens: tokenBudget },
        attempt,
        key,
      );
    } catch (error) {
      if (!(error instanceof GonkaError)) throw error;
      lastError = error;
      if (!error.retryable || attempt === maxAttempts || signal?.aborted) break;
      if (error.truncated) {
        // Same body, same cached truncation. Doubling the ceiling both gives the
        // model room to finish and changes the request enough to miss the cache.
        if (tokenBudget >= MAX_TOKEN_BUDGET) break;
        tokenBudget = Math.min(tokenBudget * 2, MAX_TOKEN_BUDGET);
      }
      // Exponential backoff with jitter, so probes rejected together do not come
      // back together. Three cases, and they want different waits:
      //   - a timed-out call waits not at all, because the router is already
      //     holding a finished completion for that exact body;
      //   - a rate limit waits as long as the gateway asked, or several seconds,
      //     because it is a window and a one-second retry lands inside it;
      //   - anything else gets the ordinary blip backoff.
      // The deadline check at the top of the loop is what keeps any of these
      // from overrunning the phase the caller budgeted.
      if (!error.timedOut) {
        const base = error.retryAfterMs || 700 * 2 ** (attempt - 1);
        await sleep(base + Math.random() * 600);
      }
    }
  }

  if (lastError) throw lastError;
  // Only reachable when the deadline had already passed, or the caller had gone
  // away, before a single send could be made. Say which; "failed without a
  // receipt" told a reader nothing they could act on.
  throw new Error(
    signal?.aborted
      ? "Cancelled before this Gonka call was sent"
      : "No time left in this phase to send this Gonka call",
  );
}

async function attemptChat(
  options: GonkaCallOptions,
  attempt: number,
  key: string,
): Promise<GonkaCallResult> {
  const {
    model,
    messages,
    purpose,
    temperature = 0,
    maxTokens = 1200,
    timeoutMs = 120_000,
    chatTemplateKwargs,
    signal,
  } = options;

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(chatTemplateKwargs ? { chat_template_kwargs: chatTemplateKwargs } : {}),
  };
  const startedAt = Date.now();

  const base: GonkaReceipt = {
    requestId: "",
    devshardId: "",
    completionId: "",
    model,
    systemFingerprint: "",
    latencyMs: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    finishReason: "",
    purpose,
    attempts: attempt,
    request: body,
    rawResponse: "",
    reasoning: "",
    status: "error",
    startedAt,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    const response = await fetch(`${GONKA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Inference is never cacheable, and the framework's fetch instrumentation
      // stalls on this request without it.
      cache: "no-store",
    });

    // The Gonka Request ID the brief asks us to display lives in the response
    // headers, not the body. Capture it before anything else can throw.
    const requestId = response.headers.get("x-request-id") ?? "";
    const devshardId = response.headers.get("x-devshard-id") ?? "";
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      const detail = redact((await response.text()).slice(0, 400));
      const receipt: GonkaReceipt = {
        ...base,
        requestId,
        devshardId,
        latencyMs,
        rawResponse: detail,
        error:
          response.status === 429
            ? "The Gonka Router was rate limiting this burst of probes"
            : `Gonka Router returned HTTP ${response.status}`,
      };
      throw new GonkaError(receipt.error!, receipt, RETRYABLE.has(response.status), {
        retryAfterMs: retryAfterFrom(response, attempt),
      });
    }

    const json = (await response.json()) as GonkaChatResponse;
    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? "";
    const reasoning = choice?.message?.reasoning ?? "";

    const receipt: GonkaReceipt = {
      ...base,
      requestId,
      devshardId,
      completionId: json.id ?? "",
      systemFingerprint: json.system_fingerprint ?? "",
      latencyMs,
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
      finishReason: choice?.finish_reason ?? "",
      rawResponse: text,
      reasoning: reasoning ?? "",
      status: "ok",
    };

    // "Empty" is not only a zero-length body. A response that is nothing but an
    // unterminated <think> block carries no answer either, and it is the shape
    // MiniMax-M2.7 returns when the ceiling lands mid-thought. Both are one
    // failure and both are worth the same retry, so they are detected together.
    const answerText = stripThinking(text);
    if (!answerText) {
      const truncated = choice?.finish_reason === "length";
      const cause = truncated
        ? "the node used its entire token budget on reasoning and never reached an answer"
        : text.trim()
          ? "the node returned reasoning but no answer"
          : "the node returned an empty completion";
      throw new GonkaError(
        `Gonka node produced no answer: ${cause}`,
        { ...receipt, status: "error", error: cause },
        true,
        { truncated },
      );
    }

    return { text, receipt };
  } catch (error) {
    if (error instanceof GonkaError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    const cancelled = aborted && Boolean(signal?.aborted);
    const timedOut = aborted && !cancelled;
    const message = cancelled
      ? "Cancelled — the caller went away"
      : timedOut
        ? `Timed out after ${Math.round(timeoutMs / 1000)}s`
        : redact(error instanceof Error ? error.message : String(error));
    throw new GonkaError(
      message,
      { ...base, latencyMs: Date.now() - startedAt, error: message },
      // A network blip is worth another try, and so is a timeout: the router
      // finishes the generation regardless of whether the client is still
      // listening and serves it to the next identical request, so the re-send
      // usually returns in seconds. Measured — see ITERATION_LOG.md, finding C.
      // Only a caller who has gone away is not worth asking again for.
      !cancelled,
      { timedOut },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}

/** Live model list from the Gonka Router. Used by the health check. */
export async function gonkaModels(timeoutMs = 20_000): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${GONKA_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Gonka Router returned HTTP ${response.status}`);
    const json = (await response.json()) as { data?: Array<{ id?: string }> };
    return (json.data ?? []).map((m) => m.id ?? "").filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

interface GonkaChatResponse {
  id?: string;
  system_fingerprint?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null; reasoning?: string | null };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}
