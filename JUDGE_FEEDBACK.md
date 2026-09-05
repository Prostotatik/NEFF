# Judge feedback — NEFF (second pass)

**Date:** 2026-09-04
**Judged against:** `JUDGING_CRITERIA.md` (organizers' verbatim words)
**Method:** re-read the first-pass `JUDGE_FEEDBACK.md` (74/100) before touching anything, then verified
every claimed fix independently rather than trusting the changelog: `./init.sh --check`, `npm test`
(57/57), `npm run typecheck` (clean), a fresh `POST /api/verify` against the live router (174.6s,
timed with `time curl`), two headless-Chrome screenshots of live report permalinks, seven `ffmpeg`
frame extractions from `evidence/pitch/pitch.mp4`, a real `npm run share` tunnel run followed by an
unauthenticated `GET` on the GitHub repo, a live `curl` of both cited arXiv abstract pages, and a full
grep of `lib/`, tracked files and `git log -p` for a leaked key.

---

## Status of every CRITICAL finding from the first pass

| # | First-pass finding | Status | Evidence |
|---|---|---|---|
| 1 | No Live Demo URL, no video (two of three hard deliverables missing) | **PARTLY FIXED** | Video: fixed, see below. Live URL: `npm run share` genuinely works — I ran it and got `https://loud-lizards-invite.loca.lt` printed within ~15s — but it is a manually-operated tunnel, not a standing link, and `README.md` line 1 still carries no URL. Worse, a **new** blocker surfaced on direct verification: `curl https://api.github.com/repos/Prostotatik/GONKA_TRACK.md` returns `404` — the GitHub repository, the *second* hard deliverable, is not readable by a judge right now, exactly as `SUBMISSION.md` line 38 admits. |
| 2 | Mirror probe discarded a coherent dissenter on a compound claim (Streisand $50M + photo removal) | **FIXED** | `lib/prompts.ts:51` now states, in the prep prompt: "Atomic. This is the most important requirement... no "X and Y"... A compound claim is a failed extraction." Confirmed live in `evidence/pitch/pitch.mp4` frame at 0:42 (`evidence/judge/frames/f42.png`): the extracted claim is the single sentence "In 2003, Barbra Streisand sued photographer Kenneth Adelman and Pictopia.com for US$50 million for violation of privacy" — the photo-removal conjunct is gone. `PROGRESS.md:66-69` documents the root cause correctly. 57/57 unit tests pass, including the compound-claim-adjacent echo/partial cases in `test/score.test.ts`. |
| 3 | Live demo can stall 154s+; adjudicator had no fallback; Vercel Hobby's 60s cap would sever it | **PARTLY FIXED** | Fallback and the probe ceiling are real and verified live. `lib/verify.ts:441` builds `adjudicators = [ADJUDICATOR, ...PANEL.filter(...)]` and loops with `timeoutMs: Math.min(model.timeoutMs, 30_000)`, `maxAttempts: 1` (`verify.ts:453,455`) — no more single point of failure. `PROBE_PHASE_BUDGET_MS = 75_000` (`verify.ts:82`) is enforced via `Math.min(model.timeoutMs, deadline - Date.now())` (`verify.ts:146`). My own live run confirms both: receipts show probes truncated to "Timed out after 43s" / "Timed out after 30s" (deadline-capped, not their full 45/60/70s budgets), and the adjudication step tried a node that failed before a second one succeeded with a real closing note. But the *total* wall time was **174.6s** (`time curl` on the exact command given in the brief) — worse than the 154s previously flagged. Worst case is now bounded (~75s probes + up to 3×30s adjudication ≈ 165s) instead of unbounded, and it always resolves honestly (`verify.ts:482-487`) instead of blanking three cells — genuine improvements — but "unwatchable on stage" still describes what I actually observed. |
| 4 | The Great Wall example button renders identical bars, indistinguishable from the naive build | **FIXED** | `README.md:129-132` now frames it explicitly: "the honest counter-case... A metric that only ever said "echo" would be worthless, and this one does not." The TRY-button order also changed: vitamin C (the flagship 1.1-witness differentiator) now leads at position 1; Great Wall moved to position 3. The equal-bars case reads as a deliberate demonstration of honesty rather than a null result. |
| 5 | Placeholder promises "a tweet"; no tweet path exists; a real tweet URL 404s | **FIXED** | Placeholder text (confirmed on screen, `evidence/judge/home_fold.png`) now reads "Paste a claim, the text of a post, or a link to an article..." — no mention of "tweet". `lib/extract.ts`'s `LOGIN_WALLED` map now gives `x.com`/`twitter.com`/`facebook.com`/`instagram.com`/`linkedin.com`/`threads.net` a clear message — "X blocks servers from reading posts. Copy the text of the post and paste that instead" — instead of a bare HTTP 404. `test/live/extract.test.ts:58` pins this behavior against the live host. Tweet *content* extraction still does not exist, but the UI no longer promises it and fails helpfully rather than confusingly — see C4 below for the residual gap. |

### First-pass MINOR findings

| # | Finding | Status |
|---|---|---|
| 1 | README promised a re-run button that doesn't exist | **FIXED** — `README.md:152` now says "copy the request body, and re-run that exact step against the same gateway yourself," matching what the ledger (`ReceiptLedger.tsx:108`, "copy request id") actually offers. |
| 2 | arXiv 2604.07650 cited under the wrong title; the r≈0.77 figure wasn't in the paper | **PARTLY FIXED** — the load-bearing number is genuinely fixed and now well-derived: `lib/score.ts:148-173` re-derives `ASSUMED_OVERLAP = 0.44` directly from arXiv 2605.29800's own stated "9 judges ≈ 2 effective votes" (`2 = 9/(1+8p) → p=0.4375`), and `PRIOR_ART.md:39-41` carries an explicit correction note. 2604.07650 is no longer load-bearing for any constant. But `PRIOR_ART.md:35-36` **still** gives it the wrong title — "How Independent are Large Language Models? A Statistical Framework for Auditing Behavioral Entanglement and Reweighting Verifier Ensembles." I fetched `https://arxiv.org/abs/2604.07650` live; its actual title is "A Statistical Framework for Auditing Behavioral Dependence and Induced Bias in LLM Judges." (2605.29800's title, by contrast, is quoted correctly and verified.) |
| 3 | `JUDGING_CRITERIA.md` pointed C4 at a non-existent `/api/extract` | **FIXED** — row now reads `lib/extract.ts fetch + the prep call in lib/verify.ts` (`JUDGING_CRITERIA.md:60`). |
| 4 | ~750px of dead space below the fold on the home page at 1440×1600 | **PARTLY FIXED** — a new closing paragraph citing "Nine Judges, Two Effective Votes" was added, shrinking the gap to roughly 550px at 1440×1600 (`evidence/judge/home.png`). At the standard 1440×900 judge viewport the page is fully populated with no visible dead space (`evidence/judge/home_fold.png`) — this is now a non-issue at normal viewport heights and a minor cosmetic one at taller ones. |

---

## Per-criterion scores (scored fresh against `JUDGING_CRITERIA.md`)

| # | Criterion | Score | Anchored justification |
|---|---|---|---|
| C1 | All inference on Gonka Router (**hard gate**) | **10** | Unchanged and still clean: `lib/gonka.ts` is the only client. Live `GET /api/health` returns `keyConfigured:true` and all 3 panel models `online:true`. **GATE PASSED.** |
| C2 | Multi-model cross-verification (≥2) | **10** | Unchanged. My own live `/api/verify` run shows DeepSeek V4 Flash, MiniMax M2.7 and Kimi K2.6 all probed three ways each, 12 total calls. |
| C3 | Consensus Logic for disagreement (**highest discretionary**) | **10** | The Kish effective-witness math is unchanged and still tested (57/57, up from 38). The specific flaw docked last time — a coherent dissenter silenced by a compound claim — is fixed at the source: `lib/prompts.ts:51` mandates an atomic claim, verified live in the pitch video's own Streisand run. No remaining objection found. |
| C4 | Claim extraction from URL / tweet / text | **8** | URL extraction, previously broken by the SSRF hardening per `PROGRESS.md:76-79`, now works and is live-regression-tested (`test/live/extract.test.ts`), confirmed again by me via the `/r/y47knq2ujapz` permalink and the pitch video's Wikipedia run. The UI no longer over-promises: the placeholder dropped "a tweet," and `LOGIN_WALLED` gives actionable guidance instead of a raw 404 for X/Twitter/Facebook/Instagram/LinkedIn/Threads. Docked because tweet *content* extraction, one of the three input types the organizers name explicitly, still does not exist — it is now honestly declined rather than silently broken, which is real progress but not the criterion fully met. |
| C5 | Truth Score 0–100 + detailed Reasoning Trace | **10** | Unchanged arithmetic display, and the previous dock (degraded three-blank-cell state) is resolved: adjudication now fails over across the panel (`lib/verify.ts:441-480`) and, only if every node fails, prints one honest sentence instead of empty cells (`verify.ts:482-487`). |
| C6 | Transparency UI showing Gonka Request IDs per step | **10** | Unchanged and still the strongest transparency surface I've reviewed — reconfirmed live with real `req-` ids, devshard ids, latencies and token counts in my own curl run. |
| C7 | Neutrality prompts, evidence citation | **9** | Unchanged: `mirrorPrompt = directPrompt(negation)` is still byte-identical, UNCERTAIN is still legitimized, invented citations are still forbidden. No new issue found, no regression. |
| C8 | Originality (**disqualifying gate**) | **9** | `PRIOR_ART.md` still names real competitors and both arXiv IDs still resolve to real papers (I re-fetched both live). **GATE PASSED.** The load-bearing citation problem from last time is genuinely fixed — `ASSUMED_OVERLAP` is now transparently re-derived from a figure that was actually read, with a dated correction note. Docked, reduced from last time, because `PRIOR_ART.md:35-36` still misquotes 2604.07650's title against the live arXiv page, even though that paper is no longer load-bearing for any number. |
| C9 | Live demo URL | **4** | Up from 0, on real evidence: `npm run share` does what `SUBMISSION.md` says — I ran it and reached `https://loud-lizards-invite.loca.lt` in under 15 seconds, no account needed. But it is not a standing link: it exists only while two terminals stay open, `README.md` line 1 still has no URL in it, and `DECISIONS.md` D9 (updated this pass, lines 76-81) is candid that this "requires the team's hosting account" problem is mitigated, not solved. A judge who opens the submission asynchronously, after the team's terminals close, finds nothing. |
| C10 | Clean repo + Gonka integration docs | **5** | Down from 9 on a fact this pass was told to verify rather than trust: `curl -sS https://api.github.com/repos/Prostotatik/GONKA_TRACK.md` returns `{"message":"Not Found"}` — the repository is private, exactly as `SUBMISSION.md:38-40` discloses. Everything measurable *inside* the repo is excellent (`npm run typecheck` clean, 57/57 tests, `docs/GONKA.md` present, the stale `/api/extract` reference in `JUDGING_CRITERIA.md` fixed) — but a judge cannot see any of it right now, and "clean code with clear documentation" a judge cannot open does not satisfy the submission criterion it is scored against. |
| C11 | 2-minute video pitch | **9** | Up from 2. `evidence/pitch/pitch.mp4` is real: `ffprobe` reports 104.6s (~1:45) h264 1440×900. I extracted 7 frames independently and confirmed the claimed content: the streaming probe grid around 0:42 (`f42.png`), a live Wikipedia URL run reaching a real verdict (`f55.png`, 83/100), and the Anglo-Zanzibar claim landing on 0.0 effective witnesses / NO SIGNAL (`f70.png`), with the honest "1 failed, shown honestly above" adjudication-failover line visible in the receipts frame (`f90.png`). Docked one point because the narration is synthesized TTS, openly disclosed as such in `SUBMISSION.md`. |
| C12 | First-impression design quality | **9** | Up from 8. The verdict-card rebuild is real and verified on two independent pages (the pitch video and the live `/r/y47knq2ujapz` permalink): the Effective Witness Count ("0.0" / "2.0") is now rendered far larger than the Truth Score number, and at 0.0 the "effective witnesses" gauge renders as three unfilled outlined slots against the fully filled blue "nominal consensus" bar above it — both fixes exactly as claimed. Home-page dead space is much reduced and gone entirely at the standard 1440×900 fold (`evidence/judge/home_fold.png`); a residual ~550px gap remains only at a taller 1600px viewport. |

**Weighted total: 86 / 100** (up from 74).
*(Same weighting as the first pass: C3=20; C5, C6, C9, C12=10 each; C2, C4, C7, C10, C11=8 each. C1 and C8 scored as pass/fail gates, both passed.)*

---

## The ninety-second question

**Could a judge tell this apart from the naive build in ninety seconds? Yes, and it is now a stronger,
more honest answer than last pass.** Open `/r/y47knq2ujapz` (screenshotted fresh this pass) and the
card reads **NO SIGNAL on 0.0 witnesses** in large type, with **3/3** sitting right above it in the
"what a vote would show" bar — the gap between those two numbers, now literally the two largest things
on the page, is the entire pitch. The redesigned card makes this legible faster than the first-pass
version did.

**What a judge remembers five minutes later** is likely still the same phrase as last time — "a
unanimous panel that knows nothing" — but there is now a real chance the second thing they remember is
a stalled progress bar, if they try it live during the tunnel window: my own timed run took 174.6
seconds. The idea's execution improved substantially this pass; its live-demo *feel* did not.

**Where the demo visibly breaks, stalls or looks unfinished:** nowhere in the UI itself anymore (no
more blank adjudication cells, no more dead first-impression fold) — the one place it still visibly
strains is time: a real verification run is a 3-minute wait with no way to shorten it from the user
side, run today at 174.6 seconds start to finish.

---

## Top 3 reasons this submission loses

### 1. CRITICAL — The GitHub repository, a named hard deliverable, is not readable by a judge

`SUBMISSION.md` itself flags this, so it is not a hidden problem — but flagging a blocker in a
markdown file a judge is not guaranteed to open does not fix it. `curl -sS
https://api.github.com/repos/Prostotatik/GONKA_TRACK.md` returns `404` right now. Everything this
pass verified about code quality — clean typecheck, 57/57 tests, accurate docs — is invisible to a
judge who clicks the repo link from the submission form and hits a 404. Two of three "Submission
Criteria" items depend on this being public.

**Fix:** GitHub → Settings → General → Danger Zone → Change visibility → Public. `SUBMISSION.md`
already says this takes ten seconds; it is still not done as of this pass.

### 2. CRITICAL — The Live Demo URL is real but exists only while someone is watching two terminals

`npm run share` is not vaporware — I ran it and reached a genuine public URL,
`https://loud-lizards-invite.loca.lt`, in under 15 seconds. That is a legitimate, well-documented
answer to "no hosting account." But it is not what "Live Demo URL" on a submission form implies: a
link that resolves whenever a judge clicks it. `README.md` still carries no URL on line 1.
`DECISIONS.md` D9 is candid that this is a mitigation, not the deployment `docs/DEPLOY.md` describes.

**Fix:** either commit to running `npm run build && npm start` + `npm run share` for the full judging
window and paste the resulting URL into the submission form at the last possible moment, or spend the
ten minutes on the real Vercel deploy in `docs/DEPLOY.md` (now honestly caveated about the 60s Hobby
cap) so the link survives without anyone tending it.

### 3. CRITICAL — A live verification is still a ~3-minute wait, now bounded but not shortened

The specific bug from last time — a 90s adjudicator timeout with no fallback, degrading to three blank
UI cells — is genuinely fixed: `lib/verify.ts:441-480` fails over across the whole panel, capped at 30s
per attempt, and I watched it work on a real run. But the *total* time did not improve: `time curl`
on the exact command in this pass's brief measured **174.6 seconds**, with the receipt trail showing
two failed probes and an adjudicator that needed a second attempt before it produced real content.
The system is more honest under stress now, not faster under it — worst case is still bounded near
prep + 75s probes + up to 3×30s adjudication ≈ 165s+, and today's router congestion (flagged in the
judging brief itself) makes that the realistic case, not the outlier.

**Fix:** race the panel for adjudication instead of trying nodes serially (`Promise.any` over the
three candidates, each still capped at 30s, rather than a for-loop) — this alone should cut the
worst-case adjudication tail from ~90s to ~30s without touching the probe phase. Consider also an
overall wall-clock budget on the whole run (not just the probe phase) so a judge sees a hard upper
bound stated in the UI rather than an open-ended spinner.

---

## Remaining findings

- **MINOR — Tweet extraction still doesn't exist**, though it is now honestly declined. The
  organizers name "tweet" as one of three explicit input types; NEFF handles two of the three and
  gives a clear, actionable message on the third rather than failing silently. This is a real
  improvement from a fabrication-adjacent finding to a documented gap, but it remains a gap.
  **Fix:** an oEmbed/syndication fallback for x.com would close it entirely; if that's out of scope,
  the current honest decline is a reasonable stopping point.
- **MINOR — `PRIOR_ART.md` still mistitles arXiv 2604.07650.** Confirmed live against
  `arxiv.org/abs/2604.07650`: the real title is "A Statistical Framework for Auditing Behavioral
  Dependence and Induced Bias in LLM Judges," not the "...Entanglement and Reweighting Verifier
  Ensembles" text still in `PRIOR_ART.md:35-36`. Lower severity than last pass because this paper no
  longer backs any number in `lib/score.ts` — but a judge who spot-checks *any* citation in a document
  whose entire purpose is citation hygiene, and finds one still wrong, will discount the rest.
  **Fix:** one-line correction, same as the 0.77 fix already applied two lines above it.
- **MINOR — Home page dead space, much reduced.** Gone at the realistic 1440×900 judge viewport;
  roughly 550px remains at 1440×1600, down from ~750px. Not worth further effort ahead of the three
  items above.
- **Housekeeping, not scored** — `gonka-ai.md` (untracked, gitignored per `.gitignore:9`) contains the
  live `GONKA_API_KEY` in plaintext, pasted from the router dashboard. It has never been committed
  (`git log --oneline -- gonka-ai.md` returns nothing) and the repo's only tracked `sk-` strings are
  placeholders and a redaction test fixture, so this does not meet the "committed secret" bar. Still,
  a stray `git add -A` before the repo goes public would leak a live key — worth deleting or moving
  outside the working tree before flipping visibility to Public.

## What I would not change

The consensus math (C3), the Gonka integration (C1) and the receipt ledger (C6) remain the strongest
execution of those three requirements I have scored across either pass. The atomic-claim fix is the
right fix, applied at the right layer (the prep prompt, not a UI patch), and the adjudication failover
is a real architectural improvement even though it didn't buy back the wall-clock time. The team
verified its own work harder this pass than most submissions verify anything — `PROGRESS.md`, the
qa-tester's 18/18 FEATURES.json pass with screenshot evidence, and the dated correction note in
`PRIOR_ART.md` all read as genuine self-audit rather than changelog theater. The two remaining
criticals are both distribution problems (repo visibility, URL durability) and a latency problem, not
credibility problems — which is a meaningfully different, better place to be than last pass.

UNADDRESSED CRITICAL FINDINGS: 3
