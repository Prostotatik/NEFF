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

/**
 * The chain of thought on its own, with the tags removed.
 *
 * MiniMax-M2.7 emits it inline in a `<think>` block; the router returns Kimi's
 * in a separate `reasoning` field on the message. Either way this is the part of
 * the answer the model actually did its work in, and the structured object it
 * writes afterwards is a summary of it. When that summary drops something, this
 * is where the dropped thing still exists.
 */
export function extractThinking(text: string): string {
  const closed = [...text.matchAll(/<think>([\s\S]*?)<\/think>/gi)].map((m) => m[1]);
  if (closed.length > 0) return closed.join("\n\n").trim();
  const open = text.match(/<think>([\s\S]*)$/i);
  return open ? open[1].trim() : "";
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
function balancedObjectAt(text: string, start: number): string | null {
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

function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  return start === -1 ? null : balancedObjectAt(text, start);
}

/**
 * Every balanced JSON object in a string, outermost first at each start point.
 *
 * Used only by the salvage path, which has to look inside a chain of thought
 * where the object it wants is buried in prose and may be preceded by smaller
 * example objects the model was talking about.
 */
function allBalancedObjects(text: string, limit = 24): string[] {
  const out: string[] = [];
  let from = 0;
  while (out.length < limit) {
    const start = text.indexOf("{", from);
    if (start === -1) break;
    const found = balancedObjectAt(text, start);
    if (found) {
      out.push(found);
      from = start + found.length;
    } else {
      from = start + 1;
    }
  }
  return out;
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

/** Where a structured answer came from. `draft` means it was recovered. */
export type AnswerOrigin = "answer" | "draft";

export interface ParsedAnswer<T> {
  value: T;
  origin: AnswerOrigin;
}

/**
 * Parse a model response, and if the answer itself is unreadable, recover the
 * model's own draft of it from inside its chain of thought.
 *
 * Measured on the Gonka panel: MiniMax-M2.7 writes the object it is about to
 * return *inside* its `<think>` block first — "Let me structure this properly:
 * ```json { "anchors": [ ... ] }```" — and only then repeats it after the block
 * closes. When the token ceiling lands mid-thought, the block never closes, the
 * repeat never happens, and everything the model found is discarded even though
 * it had already written the answer out in full. That is the gap between what a
 * model reasoned and what this app surfaced.
 *
 * The recovered object is the model's own JSON for this same request. Nothing is
 * synthesised, inferred or merged: a candidate is used only if it parses and
 * carries the field this probe asked for. `origin` is carried through to the
 * report so a reader is told when an answer came from the working rather than
 * from the conclusion — a recovered answer is a real answer, but the reader is
 * entitled to know it was recovered.
 */
export function parseAnswer<T>(raw: string, requiredKey: string): ParsedAnswer<T> | null {
  const direct = parseJsonObject<T>(raw);
  if (direct && requiredKey in (direct as Record<string, unknown>)) {
    return { value: direct, origin: "answer" };
  }

  const thinking = extractThinking(raw);
  if (thinking) {
    // Last first: a model that drafts twice has refined the later one, and the
    // final draft is the one it was about to return.
    for (const candidate of allBalancedObjects(thinking).reverse()) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          requiredKey in (parsed as Record<string, unknown>)
        ) {
          return { value: parsed as T, origin: "draft" };
        }
      } catch {
        // A truncated draft is not a draft. Try the one before it.
      }
    }
  }

  // Nothing carried the field this probe asked for, so there is no answer here.
  //
  // This used to hand back whatever parsed, on the reasoning that an object is
  // better than nothing. It is not. An anchor probe reads `anchors` straight off
  // the result, and an object without that key yields an empty list — which the
  // report then presents as a model that "named no source, independence
  // assumed", when in truth the node never gave a readable answer at all. A
  // failed probe reported as a successful one is precisely the thing the rest of
  // this file exists to prevent.
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
