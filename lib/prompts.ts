/**
 * Prompt design.
 *
 * Two constraints shape every prompt here.
 *
 * Neutrality: the brief asks for prompts that "instruct the models to be
 * objective and cite specific evidence for their conclusions". So no prompt
 * tells a model what we expect, what the other models said, or that a
 * verification is in progress. Each probe is a fresh, isolated request.
 *
 * Blindness: the mirror probe presents the negated claim as though it were the
 * original claim under test. A model that could see it was being tested for
 * consistency would answer consistently, and the probe would measure
 * instruction-following instead of belief. This is the reason the mirror probe
 * is a separate request with no shared context rather than a second turn.
 */

import type { ChatMessage } from "./gonka";

const ANALYST_SYSTEM = `You are an evidence analyst. You assess factual claims on their merits.

Rules you follow without exception:
- Judge only what the claim asserts. Ignore who might have said it and why.
- Political, commercial and national framing are irrelevant to whether a statement is factually accurate.
- Name concrete evidence: a specific document, dataset, event, publication or record. "General knowledge", "widely reported" and "common sense" are not evidence and must never be given as one.
- If you do not have specific evidence either way, say UNCERTAIN. Saying UNCERTAIN when you are genuinely unsure is a correct answer, not a failure.
- Your confidence must reflect the strength of the evidence you can actually name, not how familiar the claim sounds.
- Reply with a single JSON object and nothing else. No preamble, no markdown fence, no commentary after the object.`;

/** Turn raw user input into the one checkable proposition, plus its negation. */
export function prepPrompt(input: string, isUrl: boolean, pageText?: string): ChatMessage[] {
  const material = isUrl
    ? `The user submitted this URL for fact-checking:\n${input}\n\nText extracted from that page:\n"""\n${(pageText ?? "").slice(0, 6000)}\n"""`
    : `The user submitted this text for fact-checking:\n"""\n${input.slice(0, 6000)}\n"""`;

  return [
    {
      role: "system",
      content: `You prepare claims for verification. You do not verify anything yourself and you never state whether a claim is true.

Reply with a single JSON object and nothing else:
{
  "claim": "one self-contained, checkable proposition in a single sentence",
  "negation": "the faithful logical negation of that proposition, phrased as a natural standalone assertion",
  "rationale": "one sentence on why this is the central checkable claim in the material",
  "title": "a short title for the source, or empty string"
}

Requirements for "claim":
- Self-contained: a reader who has not seen the original material must be able to check it. Resolve every pronoun, and include the named entities, quantities, places and dates the claim depends on.
- Checkable: an assertion about the world that evidence could confirm or contradict. Not an opinion, prediction or value judgement.
- Faithful: do not soften, sharpen, or editorialise what was asserted.
- If the material contains several claims, choose the one the material is really making, not the easiest one to check.

Requirements for "negation":
- The direct logical negation of "claim", asserting the opposite state of affairs.
- It must read as a natural, confident, standalone assertion that someone might genuinely make. Do not write "It is not the case that...", do not mention the original claim, and do not signal in any way that it is a negation.
- Keep every entity, quantity, place and date from the claim identical. Only the asserted relationship flips.`,
    },
    { role: "user", content: material },
  ];
}

/** The claim as asked. */
export function directPrompt(claim: string): ChatMessage[] {
  return [
    { role: "system", content: ANALYST_SYSTEM },
    {
      role: "user",
      content: `Assess this claim:

"${claim}"

Reply with a single JSON object and nothing else:
{
  "stance": "SUPPORTED" | "REFUTED" | "UNCERTAIN",
  "confidence": a number from 0 to 1,
  "reasoning": "two to four sentences. State what the evidence is and how it bears on the claim.",
  "key_evidence": "the single most decisive piece of evidence you are relying on, named specifically"
}

"SUPPORTED" means the evidence you can name shows the claim is accurate.
"REFUTED" means the evidence you can name shows it is inaccurate.
"UNCERTAIN" means you cannot name evidence that settles it either way.`,
    },
  ];
}

/**
 * The negated claim, presented blind as if it were the claim under test.
 * Identical wording to `directPrompt` so that any difference in the answer is
 * caused by the claim's content, not by the framing of the question.
 */
export function mirrorPrompt(negation: string): ChatMessage[] {
  return directPrompt(negation);
}

/** What evidence is this model actually leaning on? */
export function anchorPrompt(claim: string): ChatMessage[] {
  return [
    { role: "system", content: ANALYST_SYSTEM },
    {
      role: "user",
      content: `What body of evidence does an assessment of this claim actually rest on?

"${claim}"

Reply with a single JSON object and nothing else:
{
  "anchors": ["up to three evidence bases, most decisive first"],
  "note": "one sentence on what those would have to show for the claim to hold"
}

An anchor names *where the knowledge comes from*, as precisely as you can put it: the organisation and the kind of report ("Cochrane systematic reviews of vitamin C trials"), the dataset and its publisher ("Eurostat quarterly GDP releases"), the record type and body ("US Supreme Court opinions"), the research literature and its subject ("randomised trials of statin therapy in primary prevention").

You are not being asked for a citation and you must not invent one. An exact title, author or year is welcome only if you are sure of it; if you are not, name the evidence base without them. That is a complete and correct answer.

What is not acceptable is a non-answer: "general knowledge", "public reporting", "news coverage", "training data", "common knowledge", "widely known". Every claim that can be assessed at all rests on some identifiable body of evidence — name it. Return an empty array only if you genuinely cannot assess this claim from any identifiable source at all.`,
    },
  ];
}

/** Closing adjudication over the whole probe battery. */
export function adjudicationPrompt(
  claim: string,
  negation: string,
  panelSummary: string,
  independenceSummary: string,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You write the closing note on a fact-check. You are given how a panel of independent models answered, and a measurement of how independent those answers actually were.

You do not re-decide the verdict and you do not restate the scores. Your job is to tell a reader the two things a number cannot: what the answer actually hinges on, and what would change it.

Reply with a single JSON object and nothing else. Write for an intelligent reader who is not a machine-learning engineer: plain sentences, no jargon, no hedging padding.`,
    },
    {
      role: "user",
      content: `Claim under test:
"${claim}"

The negated form used to probe the panel blind:
"${negation}"

How the panel answered:
${panelSummary}

How independent those answers were:
${independenceSummary}

Reply with a single JSON object and nothing else:
{
  "load_bearing_fact": "the one fact this verdict rests on. If that fact is wrong, the verdict is wrong. One sentence.",
  "falsifier": "the specific evidence that would flip this verdict, and where a reader would look for it. One or two sentences.",
  "agreement_diagnosis": "why the panel landed where it did, and whether their agreement or disagreement should be taken as meaningful. Two or three sentences, referring to what the independence measurement above actually shows.",
  "contention": "if the panel split, the precise point they disagree about. If they did not split, an empty string."
}`,
    },
  ];
}
