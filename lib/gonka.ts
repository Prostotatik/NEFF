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
  /** Sends, including the first. Only transient gateway failures are retried. */
  maxAttempts?: number;
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

  constructor(message: string, receipt: GonkaReceipt, retryable = false) {
    super(message);
    this.name = "GonkaError";
    this.receipt = receipt;
    this.retryable = retryable;
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
 * One inference on the Gonka Network, retried through transient gateway
 * congestion.
 *
 * A verification fires nine probes at once, and the router answers a burst that
 * size with 429s and Cloudflare 524s often enough that without this the panel
 * loses witnesses to queueing rather than to anything about the claim. Retries
 * are counted on the receipt so the ledger stays honest about what it took.
 */
export async function gonkaChat(options: GonkaCallOptions): Promise<GonkaCallResult> {
  const { maxAttempts = 3, signal } = options;
  // Resolved before the loop: a misconfigured key is not a transient failure and
  // must not be retried three times with backoff before saying so.
  const key = apiKey();
  let lastError: GonkaError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) break;
    try {
      return await attemptChat(options, attempt, key);
    } catch (error) {
      if (!(error instanceof GonkaError)) throw error;
      lastError = error;
      if (!error.retryable || attempt === maxAttempts || signal?.aborted) break;
      // Exponential backoff with jitter, so three probes that were rejected
      // together do not come back together.
      await sleep(700 * 2 ** (attempt - 1) + Math.random() * 600);
    }
  }

  throw lastError ?? new Error("Gonka call failed without a receipt");
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
      throw new GonkaError(receipt.error!, receipt, RETRYABLE.has(response.status));
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

    if (!text.trim()) {
      // Almost always a node that spent its whole token budget thinking.
      const cause =
        choice?.finish_reason === "length"
          ? "the node used its entire token budget on reasoning and never reached an answer"
          : "the node returned an empty completion";
      throw new GonkaError(
        `Gonka node produced no answer: ${cause}`,
        { ...receipt, status: "error", error: cause },
        choice?.finish_reason !== "length",
      );
    }

    return { text, receipt };
  } catch (error) {
    if (error instanceof GonkaError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    const message = aborted
      ? signal?.aborted
        ? "Cancelled — the caller went away"
        : `Timed out after ${Math.round(timeoutMs / 1000)}s`
      : redact(error instanceof Error ? error.message : String(error));
    throw new GonkaError(
      message,
      { ...base, latencyMs: Date.now() - startedAt, error: message },
      // A network blip is worth another try; a timeout means the node is
      // genuinely too slow for this run and retrying would only stall it.
      !aborted,
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
