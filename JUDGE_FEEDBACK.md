# Judge feedback — Quorum

**Date:** 2026-09-04
**Judged against:** `JUDGING_CRITERIA.md` (organizers' verbatim words)
**Method:** README read cold at ninety seconds, `./init.sh --check`, `npm test`, `npm run typecheck`,
one live `POST /api/verify` run against the real router, two rendered report permalinks screenshotted
headless, full grep of `lib/` and `git log` for a leaked key.

---

## Per-criterion scores

| # | Criterion | Score | Anchored justification |
|---|---|---|---|
| C1 | All inference on Gonka Router (**hard gate**) | **10** | `grep -rniE "openai\|anthropic\|groq\|ollama\|mistral\|fireworks" lib app components package.json` returns **zero hits**; `lib/gonka.ts:17` is the only base URL and there is no provider abstraction to hide one behind. `./init.sh --check` prints `Gonka Router reachable — 3 models available`. **GATE PASSED.** |
| C2 | Multi-model cross-verification (≥2) | **10** | Receipt ledger on `/r/wnmyb89u38` lists 11 inferences across DeepSeek V4 Flash, MiniMax M2.7 and Kimi K2.6, served by **8 distinct devshard nodes** — not three calls in a loop. |
| C3 | Consensus Logic for disagreement (**highest discretionary**) | **9** | `lib/score.ts:276` is a real Kish effective-sample-size `k / (1 + (k−1)ρ)` with `k` discrimination-weighted and `ρ` measured from named evidence anchors, `majorityStance` weights the tally by discrimination so an echo cannot pick the winner (`score.ts:249`), and 38 unit tests pin the edge cases. Docked one point: the echo detector misfires on compound claims — see CRITICAL 3. |
| C4 | Claim extraction from URL / tweet / text | **6** | Text and URL both work: `/r/wnmyb89u38` is a real Wikipedia URL run, and `lib/extract.ts` carries a genuine SSRF guard (private ranges, CGNAT, link-local metadata, `redirect: "error"`). But the textarea placeholder says "Paste a claim, **a tweet**, or a link" and there is not one line of tweet handling in the repo — `grep -rniE "twitter\|x\.com\|tweet\|nitter" lib app components` hits only that placeholder string. |
| C5 | Truth Score 0–100 + detailed Reasoning Trace | **9** | Verdict card shows `77/100 ± 23`, the arithmetic (`stance balance +1.00`, `evidence weight 1.2/(1.2+1) 0.55`, `50 + 50 × balance × weight = 77`) is printed on screen, and every model's full stance, confidence, prose reasoning, evidence list and mirror answer are rendered. Docked for the degraded state — see CRITICAL 4. |
| C6 | Transparency UI showing Gonka Request IDs per step | **10** | `components/ReceiptLedger.tsx` renders per-call `req-1788476478644761711-584010`, devshard `70750`, engine `vllm-0.25.1-tp2-8aac2e07`, latency, tokens, and expands to the exact request body and raw response. This is the most complete transparency surface I have seen today by a distance. |
| C7 | Neutrality prompts, evidence citation | **9** | `lib/prompts.ts:95` is `mirrorPrompt = directPrompt(negation)` — byte-identical, so blindness is structural, not promised. `prompts.ts:26` legitimises UNCERTAIN as a correct answer and `:116` forbids inventing a citation. |
| C8 | Originality (**disqualifying gate**) | **9** | `PRIOR_ART.md` names the real competitors (Full Fact, ClaimBuster, Logically, prior EasyA winners) and states the negative finding precisely. The two central arXiv IDs, 2604.07650 and 2605.29800, **both resolve to real papers** — I checked. **GATE PASSED**, with a citation-hygiene deduction (MINOR 2). |
| C9 | Live demo URL | **0** | There is no deployed URL anywhere in the repo. `docs/DEPLOY.md` explains how to deploy; `DECISIONS.md:51` (D9) admits it "requires the team's hosting account". I score what is in front of me, and what is in front of me is `localhost:3000`. |
| C10 | Clean repo + Gonka integration docs | **9** | `npm run typecheck` clean, `npm test` 38/38 pass, `docs/GONKA.md` present, no key in `git log -p` (the only `sk-` in tracked files is a redaction *test fixture* at `test/live/gonka.test.ts:69`). Docked for MINOR 3. |
| C11 | 2-minute video pitch | **2** | `find . -iname "*.mp4" -o -iname "*.mov" -o -iname "*.webm"` returns nothing. `VIDEO_PITCH.md` is a shot list that opens "recording it takes about ten minutes and needs a human with a microphone". A script is not a video. |
| C12 | First-impression design quality | **8** | The hero ("Three models agreeing is *one witness* if they all read the same page") and the verdict card are genuinely well art-directed — see `evidence/judge/report_full.png`. Docked for the ~750px of dead black space below the fold on the home page at 1440×1600 (`evidence/judge/home.png`) and the degraded card in CRITICAL 4. |

**Weighted total: 74 / 100.**
*(Weights: C3=20; C5, C6, C9, C12=10 each; C2, C4, C7, C10, C11=8 each. C1 and C8 scored as pass/fail gates, both passed.)*

---

## The ninety-second question

**Could a judge tell this apart from the naive build in ninety seconds? Yes — decisively, on one screen.**

I want to be clear that this is the rare submission where the answer is yes. Open
`/r/wnmyb89u38` and the verdict card reads **"LEANS TRUE on 1.2 witnesses"** above two stacked bars
labelled `NOMINAL CONSENSUS — WHAT A VOTE WOULD SHOW: 2/3` and `EFFECTIVE WITNESSES — WHAT IT IS
ACTUALLY WORTH: 1.2`, with an amber box underneath headed **VOTE THROWN OUT**: *"MiniMax M2.7
answered the claim and its negation the same way — REFUTED to both."* The naive build cannot render
that sentence, because it never asks the second question. The gap between the blue bar and the amber
bar is the entire product, and it is above the fold.

**What a judge remembers five minutes later:** the discarded vote, and the phrase "one witness, quoted
three times." That is a real answer to a question most submissions cannot answer at all.

That is why the findings below are so frustrating. Every one of them is a delivery failure or a
self-inflicted wound on a build whose core idea is the best I have seen today.

---

## Top 3 reasons this submission loses

### 1. CRITICAL — Two of the three hard submission deliverables do not exist

The organizers list exactly three: Live Demo URL, GitHub repo, Video Pitch. You have shipped one.

- **No Live Demo URL** (C9 = 0). `DECISIONS.md` D9 rationalises this as needing the team's hosting
  account. A judge scoring a submission form with an empty URL field does not read `DECISIONS.md`.
- **No video** (C11 = 2). `VIDEO_PITCH.md` is a competent script for a video nobody recorded.

I cannot score intent. Against a rival with a worse idea, a working Vercel link and a rough
screen recording, that rival advances and you do not.

**Fix:** `vercel --prod` with `GONKA_API_KEY` set, then paste the URL into `README.md` line 1 — the
path is already written in `docs/DEPLOY.md` and takes under ten minutes. Then record the existing
script in one take against that deployed URL. This is the highest-value hour available to this team
and it involves writing no code.

### 2. CRITICAL — The mirror probe discards a *coherent* dissenting vote on your own flagship example

This is the sharpest technical objection available and it lands on the report the README leads with.

The Streisand claim is compound: *sued for US$50 million* **and** *sought removal of the photograph*.
The generated negation preserves the conjunction — *"did not sue ... for US$50 million ..., **nor**
did she seek to remove ..."* — because `lib/prompts.ts:58` instructs "Keep every entity, quantity,
place and date from the claim identical. Only the asserted relationship flips."

MiniMax M2.7 then answered REFUTED to the claim (it believes the figure was $25,000 per violation,
not $50M) and REFUTED to the negation (she *did* sue and *did* seek removal). **Both answers are
internally consistent and, on MiniMax's model of the facts, both are correct.** It is not reading the
shape of the sentence. It is the only model on the panel that noticed the disputed number.

Quorum labels it `Echo — failed the mirror probe`, sets `vote weight 0.00`, and prints *"It is
responding to the shape of the sentence, not to the fact."* You silenced your only dissenter and told
the user it wasn't reading. For a project whose framing quotes *"centralized fact-checkers are often
accused of bias"*, an error mode that systematically zeroes minority votes on compound claims is the
worst possible failure direction — and nothing in `lib/` guards it: `grep -rniE
"compound|atomic|conjunct" lib/*.ts` returns nothing.

**Fix, in order of cost:** (a) add an atomicity requirement to the prep prompt — reject conjunctions,
split to the single load-bearing proposition, which also makes `load_bearing_fact` honest; (b) when
`direct === mirror`, run one disambiguating probe asking which conjunct drove each answer, and
downgrade to `partial` (0.5) rather than `echo` (0.0) when the model names different conjuncts;
(c) at minimum, stop asserting motive in the UI copy — "answered the same way on both forms; its vote
is discounted" is defensible, "responding to the shape of the sentence, not to the fact" is a claim
about the model's cognition you did not measure.

### 3. CRITICAL — The live demo can stall for two and a half minutes, and the documented deploy target would kill it

My one live run, `POST /api/verify` with the Great Wall claim, took **154 seconds** and lost a call:

```
RCPT anchor      MiniMaxAI/MiniMax-M2.7   lat 45929  ok
RCPT adjudicate  deepseek-ai/DeepSeek-V4  lat 90018  error  attempts 1  'Timed out after 90s'
totals: calls 11, failedCalls 1, wallMs 154169
```

Three compounding problems:

- **154s is unwatchable on stage.** The stored comparison run finished in 3.2s, so variance is ~50×
  and you cannot predict which one the judge gets.
- **The adjudication call has no fallback.** `lib/gonka.ts:122` retries only transient HTTP statuses;
  a 90s timeout is not retryable and the call is not re-issued to either of the other two models,
  even though both were idle and healthy. It is a single point of failure for the most
  narrative-carrying output in the product.
- **`docs/DEPLOY.md` names Vercel as "the Live Demo URL" and then admits the Hobby ceiling is 60
  seconds.** My run would have been severed at second 60 on the very host you recommend.

The failure is honest — the report degrades to "The closing note could not be produced: that Gonka
node did not answer" — but the visible result (`evidence/judge/degraded.png`) is a three-column
"What this rests on" card where two cells read **"The adjudicating node did not return this field."**
Two thirds of your second-best section is missing, in a card whose eyebrow still says
`ADJUDICATED ON GONKA`.

**Fix:** cut the adjudication timeout to ~25s and on timeout re-issue to the next model in the panel
(you have two healthy idle nodes and the receipt ledger already handles `attempts > 1`); when all
three fail, hide the "What this rests on" section entirely rather than rendering placeholder cells.
Deploy on a host without a 60s cap, or state the real ceiling in the README.

---

## Remaining findings

- **CRITICAL 4 — Your own example button demonstrates the naive build.** "The Great Wall of China is
  visible from the Moon…" (home screen, button 2 of 4) returns `nominalAgree 3`, `effectiveWitnesses
  3.0`, `meanAnchorOverlap 0`, no thrown-out vote. The blue and amber bars render at identical length
  (`evidence/judge/degraded.png`) and the differentiator vanishes. One in four demo paths shows a
  judge three models voting and an averaged score. **Fix:** replace it with a claim that separates
  nominal from effective, or annotate the equal-bars case explicitly — *"this time the agreement was
  real: 3 sources, 0% overlap"* is a great result and currently reads as a null one.
- **CRITICAL 5 — The UI invites an input it cannot handle.** The placeholder offers "a tweet"; there
  is no tweet path. `POST /api/verify` with an `x.com/…/status/…` URL returns `{"type":"error",
  "message":"That page returned HTTP 404."}`, and a real tweet URL hits x.com's login wall or the
  JS-shell branch at `lib/extract.ts` ("may need JavaScript to render"). C4 names tweets explicitly,
  so a judge will try one. **Fix:** either add an oEmbed/syndication fallback for x.com, or delete
  the word "tweet" from the placeholder — the second takes ten seconds and removes the finding.
- **MINOR 1 — README promises an interaction that does not exist.** *"click any row and re-run that
  exact step against the same gateway yourself"* (README line 82). Expanding a ledger row shows the
  request body, the raw response and a **copy request id** button — everything needed to re-run it by
  hand, but there is no re-run affordance. **Fix:** reword to "copy the exact request body and re-run
  it yourself", or add a `curl` copy button (the body is already in the DOM).
- **MINOR 2 — Citation title does not match the paper.** `lib/score.ts:129` and `PRIOR_ART.md:31`
  cite arXiv 2604.07650 as *"How Independent are Large Language Models? A Statistical Framework for
  Auditing Behavioral Entanglement and Reweighting Verifier Ensembles"*. The paper is real and its
  substance matches, but its actual title is *"A Statistical Framework for Auditing Behavioral
  **Dependence and Induced Bias in LLM Judges**"*. The `r = 0.77` figure that sets `ASSUMED_OVERLAP`
  is not stated in the abstract. A judge who checks your one load-bearing constant and finds the
  title wrong will discount everything else you cite. **Fix:** correct the title, and cite the
  specific table or section the 0.77 comes from.
- **MINOR 3 — `JUDGING_CRITERIA.md` points at an endpoint that does not exist.** Row C4 says
  "Served by `/api/extract`"; `app/api/` contains only `health` and `verify`. Extraction happens
  inside `lib/extract.ts`, called from the verify stream. Trivial, but it is a documentation claim a
  judge can falsify with one `ls`, in the file whose entire purpose is claiming coverage. **Fix:**
  change the cell to `lib/extract.ts`.
- **MINOR 4 — Home page dead space.** At 1440×1600 the page ends at roughly 840px, leaving ~750px of
  empty black below the footer line (`evidence/judge/home.png`). On a judge's laptop the first
  impression is a half-empty screen. **Fix:** anything below the fold — the one-paragraph explanation
  of the mirror probe, or a static thumbnail of the Streisand verdict card that links to it, which
  would also let a judge see the differentiator without waiting 154 seconds for a run.

## What I would not change

The Gonka integration (C1), the receipt ledger (C6) and the blind mirror prompt (C7) are the
strongest execution of those three requirements I have scored today. `lib/score.ts` is a genuine
statistical argument with 38 tests behind it, not a weighted average with a nice name. The idea is
first-rate. Ship the URL and the video before you touch anything else.

UNADDRESSED CRITICAL FINDINGS: 5
