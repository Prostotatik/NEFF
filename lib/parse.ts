/**
 * Getting structured data out of model prose.
 *
 * Measured behaviour of the Gonka panel that this has to survive:
 *   - MiniMax-M2.7 opens with a `<think>…</think>` block before its answer, and
 *     sometimes never closes it when it hits the token ceiling.
 *   - Every model will occasionally wrap JSON in a ``` fence, or add a sentence
 *     of preamble before it.
 *   - A truncated response leaves an unbalanced object.
 *
 * The rule for the whole file: fail loudly and return null. Never invent a
 * plausible-looking fallback object — a fabricated verdict presented as a model
 * result would be the single most dishonest thing this application could do.
 */

/** Remove chain-of-thought blocks, including an unterminated trailing one. */
export function stripThinking(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  out = out.replace(/<think>[\s\S]*$/i, "");
  out = out.replace(/^\s*(?:thinking|reasoning):[\s\S]*?(?=\{)/i, "");
  return out.trim();
}

/** Strip a markdown code fence, with or without a language tag. */
function stripFence(text: string): string {
  const fenced = text.match(/```(?:json|jsonc|javascript)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : text;
}

/**
 * Find the first balanced JSON object in a string, ignoring braces inside
 * string literals. A regex cannot do this correctly and a greedy `{[\s\S]*}`
 * swallows trailing prose.
 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Best-effort structured parse of a model response.
 * Returns null when nothing valid is present — callers must treat that as a
 * failed probe, not as a neutral answer.
 */
export function parseJsonObject<T>(raw: string): T | null {
  const cleaned = stripFence(stripThinking(raw));
  const candidates = [cleaned, firstBalancedObject(cleaned)].filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Coerce a model's stance word onto our three-valued scale. */
export type Stance = "SUPPORTED" | "REFUTED" | "UNCERTAIN";

export function normaliseStance(value: unknown): Stance | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  if (["SUPPORTED", "TRUE", "SUPPORT", "SUPPORTS", "CORRECT", "ACCURATE"].includes(v))
    return "SUPPORTED";
  if (["REFUTED", "FALSE", "REFUTE", "REFUTES", "INCORRECT", "CONTRADICTED"].includes(v))
    return "REFUTED";
  if (["UNCERTAIN", "UNSUPPORTED", "UNKNOWN", "UNVERIFIABLE", "MIXED", "INSUFFICIENT"].includes(v))
    return "UNCERTAIN";
  return null;
}

/** Clamp a model-reported confidence onto [0,1], accepting 0–100 as a courtesy. */
export function normaliseConfidence(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const scaled = n > 1 ? n / 100 : n;
  if (scaled < 0 || scaled > 1) return null;
  return Math.round(scaled * 100) / 100;
}

/** Take a model's list field and return clean, deduped, bounded strings. */
export function stringList(value: unknown, max = 5): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const s = typeof item === "string" ? item.trim() : "";
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.slice(0, 280));
    if (out.length >= max) break;
  }
  return out;
}

export function textField(value: unknown, max = 900): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
