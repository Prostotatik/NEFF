# Iteration log

What was tested against the running app and the live Gonka Router, what it showed, and what
changed as a result. Newest entry at the bottom of each section. Nothing here is marked done on a
single run.

---

## Session start — baseline

- `./init.sh --check` → `Gonka Router reachable — 3 models available`, exit 0.
- Dev server already running on `http://localhost:3000`; `/api/health` returns `ok: true` and all
  three panel models `online: true`.
- Idle page screenshotted at 1536px, no console errors, 13 running animations.

---

## Item 2 — real model requests

### Measurement harness

`scratchpad/raw-probe.mjs` fires the repo's real `directPrompt` / `anchorPrompt` bodies straight at
`api.gonkarouter.io`, bypassing the app, and dumps every raw response to JSON.
`scratchpad/analyse.mjs` then runs the repo's own `lib/parse.ts` over those captures, so the pass/fail
verdict is the parser the app actually uses rather than a re-implementation.

### Run 1 + run 2 — 96 calls (4 claims × 2 probe kinds × 3 models × 4 rounds)

| model | n | ok | HTTP 400 | client timeout | `finish_reason: length` | p50 | max |
|---|---|---|---|---|---|---|---|
| DeepSeek-V4-Flash-0731 | 32 | 31 | 0 | 1 | 0 | 562 ms | 40 957 ms |
| MiniMax-M2.7 | 32 | 31 | 0 | 1 | 3 | 562 ms | 7 843 ms |
| Kimi-K2.6 | 32 | **0** | **32** | 0 | 0 | — | — |

### Finding A — the Kimi identifier is not the problem

`GET /v1/models` returns `moonshotai/Kimi-K2.6`; `PANEL[2].id` is the same string. Compared as
code-point sequences, not visually:

```
router : 109,111,111,110,115,104,111,116,97,105,47,75,105,109,105,45,75,50,46,54   (len 20)
PANEL  : 109,111,111,110,115,104,111,116,97,105,47,75,105,109,105,45,75,50,46,54   (len 20)
```

Identical. No typo, no zero-width or homoglyph character. `cat -A lib/models.ts` shows the id lines
as pure ASCII. The 400 body is explicit that the fault is on the router:

```
unsupported model "moonshotai/Kimi-K2.6"; supported models: MiniMaxAI/MiniMax-M2.7, deepseek-ai/DeepSeek-V4-Flash-0731
```

So `/v1/models` advertises three models and `/v1/chat/completions` serves two. Nothing to fix here;
per the brief this is left alone. **Checked and closed.**

### Finding B — the Gonka Router caches completions, and that hid the real failure mode

Three separate rounds returned a byte-identical 18 434-character truncated MiniMax response for the
same claim (`content=18434` three times, `finish=length`, `completion_tokens=3200` exactly). Repeats
of an identical request body come back in ~500 ms against a 13–64 s cold latency.

Re-running the same claims with a unique nonce in the system prompt (so no request can be a cache
hit) gave **0 truncations in 10 calls** — but **5 of 10 took longer than 20 s**, with one at 64 s.

So the "empty responses" are not mostly a parsing problem. They are the long cold tail of router
latency hitting per-model client timeouts, plus one poisoned cache entry that then replays forever.

### Finding C — a timed-out request is worth retrying, and the code refuses to

`scratchpad/retry-after-timeout.mjs`: send with a deliberate 4 s cap, then re-send the identical body.

| claim | first (4 s cap) | retry | third send |
|---|---|---|---|
| Hoover Dam | AbortError | 9 620 ms ok | 1 593 ms |
| Mount Everest | AbortError | 1 504 ms ok | 1 420 ms |
| Octopuses | AbortError | 15 128 ms ok | 881 ms |
| Sahara | AbortError | 7 115 ms ok | 733 ms |

The router keeps generating after the client gives up and serves the finished completion to the next
identical request. 4/4 retries succeeded, all faster than a cold generation.

`lib/gonka.ts` marks a timeout **non**-retryable (`retryable = !aborted`), so today the app throws
away a probe whose answer the router already has. That is the single highest-value fix in item 2.

### Finding D — MiniMax cannot be told to stop thinking

Tested `chat_template_kwargs: {thinking: false}`, `{enable_thinking: false}`, `reasoning_effort:
"none"` and `"low"` against MiniMax-M2.7. All five variants returned exactly one `<think>` block.
There is no switch; the budget-and-salvage route is the only one available.

### Finding E — the 429 path lost a whole run in three seconds

Reproduced while stress-testing: after several back-to-back verifications the router started
answering 429, and one run lost **8 of 9 probes plus all three adjudicators**, every one of them
after `attempts=3` inside about a second (`0.4s`, `0.6s`, `0.9s` on the receipts). The old backoff
base was 700 ms, so all three sends landed inside the same rate-limit window.

A rate limit is a window, not a blip. `retryAfterFrom()` now honours a `Retry-After` header when the
gateway sends one and otherwise backs a 429 off from 2.5 s, capped at 9 s, with the phase deadline
still the hard stop. Note this failure was **induced by the test volume**, not by normal use — one
judge clicking verify does not trip it — but the retry policy was wrong either way.

### What changed in the code

| change | file | why |
|---|---|---|
| a timeout is retryable; a caller abort is not | `lib/gonka.ts` | finding C |
| short first leash, full leash on the last attempt | `lib/gonka.ts`, `lib/models.ts` | asking twice quickly beats waiting once slowly |
| every call carries a `deadline`; attempts are clipped to it | `lib/gonka.ts`, `lib/verify.ts` | retries share the phase budget instead of doubling it |
| an unterminated `<think>` counts as "no answer" | `lib/gonka.ts` | it is the shape MiniMax returns at the ceiling |
| a truncation retry doubles the token budget | `lib/gonka.ts` | gives room *and* misses the poisoned cache entry |
| 429 backs off from 2.5 s, honouring `Retry-After` | `lib/gonka.ts` | finding E |
| `parseAnswer()` recovers the model's own draft from its `<think>` | `lib/parse.ts` | the evidence was written and then thrown away |
| every probe keeps `thinking`, failed ones included | `lib/verify.ts`, `lib/types.ts` | the answer is a summary; the working is where what it dropped still is |
| the witness card shows the working, and says when an answer was recovered | `components/WitnessDetail.tsx`, `components/Report.tsx` | surfacing it is the point |

### Verification after the change — three live suite passes

`node tools/run-claim.mjs --suite` streams the same SSE the browser does.

| pass | probes | failed | cause of every failure |
|---|---|---|---|
| before the change | 27 | 11 | 8 × Kimi 400, **2 × client timeout**, and one whole run lost at claim preparation |
| after, pass 1 | 36 | 12 | 12 × Kimi 400 — **no timeouts, no parse failures** |
| after, pass 2 | 36 | 12 | 12 × Kimi 400 — same |

Retries were observed working rather than assumed: `attempts=2` receipts returning `ok` at 0.6 s,
8.0 s, 8.3 s and 20.7 s, each after a first send that had timed out.

One caveat found and fixed in the harness, not the app: a third suite pass reported three claims
producing nothing at all. That was `/api/verify`'s own six-runs-a-minute meter answering 429, and a
`grep` in the test command that happened to filter the line saying so. `tools/run-claim.mjs` now
paces itself, and the near-miss is why the tool's header says not to read those 429s as a product
failure.

---

## Item 1 — the idle rail

`components/IdleRail.tsx` replaces the Verification Details panel while nothing has been asked.
Two lists off one toggle, both read from the same `.runs/` directory the permalinks are served from
(`GET /api/history`, `lib/store.ts`).

They behave differently on purpose. A popular claim is a suggestion, so clicking it fills the box and
focuses it and stops — eleven inferences are the user's to spend. A recent check is a record, so
clicking it opens that run's stored report.

Verified in a real browser with `node tools/idle-check.mjs`, which watches the network as well as
the DOM:

```
idlePanel.showsAlreadyChecked            true
idlePanel.stillShowsVerificationDetails  false
popularFillsTheBox.boxNowHas             "Taking vitamin C supplements prevents the common cold."
popularFillsTheBox.boxIsFocused          true
popularFillsTheBox.stillOnLandingPage    true
tabSwitch.linkRows                       6      firstHref /r/i4p6745p6tyg
recentOpensTheRealReport.landedOn        /r/i4p6745p6tyg
recentOpensTheRealReport.showsTheRowsClaim  true
recentOpensTheRealReport.hasReceipts     true
verifyRequestsFired                      0
consoleErrors                            []
```

`verifyRequestsFired: 0` is the one that matters for "fills the input, does not auto-submit" —
asserted against the network, not against the DOM.

One defect caught by screenshot and fixed: the rows first reused the report's verdict-pill classes,
which boxed each label and wrapped `NO SIGNAL` onto two lines inside a 0.6875rem meta line. The rows
now carry colour only.

---

## Item 3 — the arithmetic

`METHOD.md` is the long form; `components/Arithmetic.tsx` is the version on the page, opened from
the "Its own arithmetic" cell. Every constant carries one of three labels — **definition**
(it follows from the 0–100 scale), **standard** (a published estimator, source named), **chosen**
(we picked it, and why).

Two things were actually checked rather than asserted:

- The arXiv citation. Fetched `arxiv.org/abs/2605.29800` and read the abstract. Title and both
  quoted phrases are verbatim: "the 9 judges effectively provide only about 2 independent votes'
  worth of information", and that the paper quantifies this "using the Kish effective sample size
  (n_eff)". The `ASSUMED_OVERLAP = 0.44` prior is derived from that figure by inverting the same
  estimator, which is now written out on screen.
- The anchor match threshold, the one number nobody published. Computed containment for all **243**
  distinct cross-model anchor pairs in `.runs/`, then swept the threshold over the 28 stored runs
  with a measurable agreeing pair:

  | threshold | mean ρ | mean effective witnesses |
  |---|---|---|
  | 0.4 | 0.619 | 1.040 |
  | 0.5 | 0.528 | 1.069 |
  | **0.6 (in use)** | **0.389** | **1.155** |
  | 0.7 | 0.329 | 1.221 |
  | 0.8 | 0.222 | 1.292 |

  A looser threshold finds more echoes and produces a more dramatic headline every time. We use 0.6,
  which credits the panel with *more* independence than it probably has. `test/threshold.test.ts`
  pins that direction so a later edit cannot quietly tune it back toward the flattering end.

The `κ = 2` comparison in `METHOD.md` was wrong on first writing — it claimed a unanimous independent
panel could not clear 80, when the algebra gives exactly 80 at n = 3. Corrected to the checkable
statement: κ = 2 needs n ≥ 3, and the highest effective witness count in 28 stored runs is 2.08.

---

## Item 4 — the working indicator

`ProbeSweep` in `components/Orbs.tsx`. Nine seats on a ring inside the sphere, dark until their node
answers; a radar wedge going round behind them; a breathing core. The static line "Probing the
panel" is gone, and the centre now carries only the count.

Three passes against live runs, each looking at the rendered pixels:

1. First attempt: seats at `r = 1.7` on a `0.62R` ring were lost among the sphere's forty-six
   existing point lights. Not legible.
2. Bigger seats on a `0.74R` ring, with a dark veil disc under the indicator to lift it off the
   cage. Legible — but the sweep was a pie slice from the centre, which cut straight across
   `3 / 9 NODES ANSWERED` every 2.6 seconds.
3. The wedge is now an annulus between `0.38R` and the seat ring, so it never crosses the count.

Console errors in every capture: none. Reduced motion is handled by the existing global rule.

---

## Second pass — two things the first pass got wrong

### The salvage branch could never run

`gonkaChat` treats a response that is nothing but an unterminated `<think>` block as no answer.
That is what makes the truncation retry possible, and it is also why `runProbe` never reached the
draft recovery: the call threw first. A branch nobody has ever run is not a fix.

Moved into `runProbe`'s catch, where the last failed attempt's receipt still carries the text, so the
order is now: ask again with a bigger budget, and only then look for the model's own draft.

Covered two ways, because neither is enough alone:

- `test/recovery.test.ts` runs the whole path — `runProbe`, `gonkaChat`, the retry ladder, the
  receipt, the parse — against a local server replaying a **captured** truncated Gonka response
  (`finish_reason: "length"`, `completion_tokens` equal to `max_tokens`). It asserts the retry
  raised the budget *before* the salvage ran, and that every recovered anchor appears verbatim in
  what the node returned.
- `test/live/salvage.test.ts` starves a real probe against the real router and asserts the same
  escalation happens there. First attempt at 900 tokens: skipped, because the node simply answered.
  Lowered to 400 — below the 600–780 completion tokens a full anchor response costs — and it
  reproduces every time.

### The closing note was being asked of the slowest node first

Every run of the four-claim suite showed `receipt adjudicate DeepSeek attempts=1 24.0s error —
Timed out after 24s`, four times out of four, and then spent another 16s failing over to MiniMax.
Three cold adjudication-shaped calls per model, unique nonce so none could be a cache hit:

| model | latencies | completion tokens |
|---|---|---|
| DeepSeek V4 Flash | 21.2 s, 15.7 s, 19.2 s | 163–202 |
| MiniMax M2.7 | 11.7 s, 7.8 s, 7.1 s | 557–1247 |
| Kimi K2.6 | 5.9 s, 6.4 s, 28.8 s | 475–538 |

About ten tokens a second against MiniMax's eighty. `ADJUDICATOR`'s comment had said "fastest of the
panel" and that had stopped being true. `CLOSING_ORDER` now leads with MiniMax — quickest and by far
the most consistent — then Kimi, then DeepSeek; claim preparation stays with DeepSeek, which writes
the shortest output of the three.

### Wall clock, same four claims, same afternoon

| claim | before | after |
|---|---|---|
| vitamin C | 55.3 s | 9.2 s |
| Great Wall | 82.0 s | 46.1 s |
| Norway's fund | 84.5 s | 60.8 s |
| Anglo-Zanzibar | 78.1 s | 48.5 s |

No adjudication failover in any of the four after the change — 11 inferences per run, the nominal
count.

### And Kimi came back

Partway through this session `moonshotai/Kimi-K2.6` stopped returning HTTP 400 and started
answering. Nothing in this repo changed to cause that, which is the strongest possible confirmation
of finding A: the identifier was never wrong, the router's chat endpoint had simply stopped serving
a model its own `/v1/models` advertised. Suite passes since then show `3/3 nominal` where they
previously showed `2/2`, and one pass recorded **36 probes, 0 failures**.

---

## Third pass — reviewing my own diff, and three rounds on the closing note

The two subagents this project runs on every diff — `code-reviewer` and `design-critic` — both died
on a subagent rate limit partway through. Rather than wait, both reviews were done by hand. That is
worth saying plainly: the usual second pair of eyes did not run.

### The review found a real bug in the fix

`deadline` clips every attempt's timeout. It was not clipping the **backoff between** attempts. So a
429 asking for nine seconds would sleep the full nine, wake, find the deadline gone, and give up
anyway — having overrun the phase by more than three seconds to accomplish nothing. Which is
precisely what `deadline` exists to prevent.

`test/retry.test.ts` now drives the whole policy through the real client against a local server that
can rate-limit, stall or answer:

| behaviour | asserted |
|---|---|
| 429, generous deadline | retried once, and the gap is over 1.5 s rather than the old 700 ms |
| `Retry-After: 2` | waited ≥ 1.9 s and < 3.4 s — the gateway's number, not the default |
| `Retry-After: 8`, 5 s of budget | gave up in under 2 s without sleeping, one send only |
| stalling server | retried, and the gap before the re-send is under 1.8 s |
| caller aborts | exactly one send, never retried |

The deadline test was checked to have teeth by removing the guard: it fails at **8201 ms** against a
5 s budget. An earlier version of the same test passed with the guard removed — the 6 s budget it
used could not tell the two behaviours apart — so it was rewritten until it could.

### The closing note took three attempts to get right

| configuration | result over a four-claim suite |
|---|---|
| 24 s, one send, DeepSeek first | timed out 4 times out of 4, then paid again to fail over |
| 12–15 s, two sends per node, MiniMax first | still missing on 3 runs out of 4 |
| **20 s, one send per node, MiniMax first** | **missing on 2 of 4 while the router was congested; 11 inferences and no failover at all on an uncongested one** |

The middle attempt was wrong for a reason worth writing down: the probe phase's
short-leash-and-retry works because a cut-off probe leaves the router holding a finished completion
that the re-send is answered from in seconds. The closing note's prompt is unique to one run, so
there is nothing warm to come back to. It simply needs the time. Different phase, different failure,
different remedy — the mistake was assuming one measurement generalised.

Adjudication also asked for `max(900, model.maxTokens)`, which is 3200 on MiniMax — far more room
than four short prose fields need, and a reasoning model uses what it is given. Measured completion
tokens on cold adjudication calls were 557, 727 and 1247, so the phase now asks for a flat 1600.

### Wall clock, and the thing not to read into it

Best clean pass after all three changes: **3.1 s / 51.9 s / 46.5 s / 70.6 s**, 36 probes, 2 failures.
A congested pass in the same hour: 92–93 s with rate limits on half the probes.

The congestion is self-inflicted. This session has spent several hundred inferences on the router in
an afternoon; a judge clicking verify once does not do that. `/api/verify` also meters a client at
six runs a minute, which is what made an early test pass look like a product failure. Do not tune
timeouts against a router this session has just been hammering — wait, then measure.

### When the closing note does go missing

Checked what a reader actually sees (`/r/pny4euejwktt`): two cells say "The adjudicating node did not
return this field", and the fourth carries the honest sentence that the note could not be produced
and that the verdict, transcript and independence measurement are unaffected because they come from
the probes. Not a good look, but a true one, and it is the failure mode the budget guards against
rather than a bug.

### The idle rail, second look

The first version put the count in the meta line — "checked 17 times · last verdict LEANS FALSE" —
and a magnifier icon on the right, which is the wrong metaphor for a control that fills a text box.
The count is the entire reason a row is in a "most checked" list, so it is now the right-hand
element, tabular, with the arrow reserved for the recent rows that actually go somewhere. Rows got
shorter, and the panel with them. Re-verified with `tools/idle-check.mjs` after the markup change:
still `verifyRequestsFired: 0`, still lands on the row's own report.

### A feature that was measured and then not built

The obvious next move on "evidence present in the reasoning does not reach the output" was to diff
the model's drafted JSON against its final one and surface anything present in the draft but missing
from the answer. That is exact rather than heuristic — both are the model's own JSON for the same
request — so it looked like a rigorous win.

Measured first. Of 62 captured responses, 5 contain both a draft inside `<think>` and a finished
answer, and by exact string comparison **5 of 5** differ. But reading them, none of the differences
is a dropped source:

```
draft : randomized placebo-controlled trials of vitamin c supplementation in general populations
answer: Randomized placebo-controlled trials of vitamin C supplementation in general adult populations

draft : nasa official documentation on earth visibility from the moon and space
answer: NASA official documentation and technical assessments addressing Earth visibility from the Moon
```

Those are refinements. The model is polishing its wording between the draft and the answer, which is
what a draft is for. A "dropped evidence" panel built on this would have reported a finding that is
not there, on every run, in a project whose entire argument is about not letting a reader assume more
than the evidence supports.

So it was not built. The only provable loss between reasoning and output is the truncation case —
the answer never written at all — which is now recovered and labelled; the general case, that an
answer is a summary of the working, is handled by surfacing the working itself rather than by
guessing what the summary left out.

---

## Sign-off

### qa-tester, against the running app

All seven new `FEATURES.json` entries gated end to end. The two that matter most for "not marked done
off a single lucky run":

- **F20 — fills the box, does not submit.** Asserted against the network, not the DOM:
  `verifyRequestsFired: 0` across the whole browser session, with `boxNowHas` matching the clicked
  row's text and `boxIsFocused: true`.
- **F24 — the working indicator.** Asserted against the browser's own animation list rather than a
  screenshot: `seatWait ×9` (one per probe seat), the sweep's `spin`, and `corePulse`, with the
  centre reading `0/9 NODES ANSWERED`.

F22 and F23 were signed off on two kinds of evidence each, because the live failure they handle is
intermittent: the replayed-capture tests that drive the whole path deterministically, and a live
run. That live run caught both mechanisms in the wild — a Kimi mirror probe returning nothing but
`<think>` (`attempts=3`, "the node returned reasoning but no answer"), which correctly errored rather
than inventing anything because there was no draft to recover; and a DeepSeek anchor probe timing out
and being re-sent twice inside its phase budget.

That same run was heavily rate-limited — 12 of 13 calls failed — and the report said so on its face
("12 failed, shown honestly above"). Worth recording as the degraded path actually being exercised
rather than reasoned about.

### The empty instance

A clean checkout has no runs, which is the first thing a judge sees, and the rail was rendering
"Already checked here" directly above "Nothing has been checked on this instance yet". Both edge
states were rendered by stubbing `/api/history` in the page before any script runs:

| history | header | body | rail height |
|---|---|---|---|
| `{popular: [], recent: []}` | "Nothing checked here yet", no tabs | one sentence inviting the first claim | 379 px |
| rejects | "Already checked here", tabs kept | the list could not be read, and verification does not go through it | 500 px |

They are deliberately different states: a failure to read the list is not a claim that nothing has
been checked. No console errors in either.

### Final measurement, on a rested router

`node tools/run-claim.mjs --suite`, 36 probes across four claims:

| claim | wall | inferences | outcome |
|---|---|---|---|
| vitamin C | 3.5 s | 11 | 21/100 LEANS FALSE, 3/3 nominal, 1.42 effective |
| Great Wall | 46.0 s | 12 | 18/100 REFUTED, 3/3 nominal, 1.8 effective |
| Norway's fund | 7.1 s | 11 | 79/100 LEANS TRUE, 3/3 nominal, 1.35 effective |
| Anglo-Zanzibar | 3.1 s | 11 | 50/100 NO SIGNAL, 3/3 nominal, 0 effective |

**36 probes, one failure.** That failure is the designed path end to end: a MiniMax mirror probe hit
its ceiling inside `<think>`, was re-sent twice with the budget doubled and then doubled again,
still did not reach an answer, and came back carrying 4000 characters of the model's own working
instead of only an error string. There was no complete draft in that working, so nothing was
recovered and nothing was invented.

### How often the recovery actually fires, said plainly

`recovered=0` in every live suite pass this session. That is not a broken feature and it should not
be sold as one that fires often. Both halves of what it needs are real and measured — MiniMax drafts
its JSON inside `<think>` in 5 of 62 captured responses, and truncation inside `<think>` is the
failure mode that loses a probe — but their conjunction needs the ceiling to land *after* the draft
and *before* the repeat, and mostly it lands earlier than that. `test/recovery.test.ts` is what
drives the branch deterministically, from a captured response that has that shape.

What fires on essentially every run instead is the cheaper half: the working is kept for every
probe, failed ones included, and the witness card will show it. `withWorking=24` of 36 probes on the
run above — every probe from the two models that return a reasoning trace at all.

### code-reviewer, on the whole diff

One MAJOR finding, and it was right.

`parseAnswer()` ended with a fallback that handed back any object that parsed, even one without the
field the probe had asked for — on the reasoning that an object is better than nothing. For the
stance probes it was harmless, because `runProbe` null-checks the stance and confidence separately.
For the **anchor** probe it was not: `stringList(parsed.value.anchors, 3)` on an object with no
`anchors` key returns `[]`, so the probe was recorded `status: "ok"` with an empty list, and the
report then told the reader that model **"named no source, independence assumed"** — a sentence
about a model that had in fact never given a readable answer. A failed probe reported as a
successful one, which is exactly the class of thing the rest of that file exists to prevent.

Triggering input: any Gonka node returning well-formed JSON for an anchor probe that omits the
`anchors` key, with no `<think>` block to recover a draft from.

Fixed by requiring the key. An *explicitly* empty `anchors: []` is still a real answer and stays one
— the anchor prompt asks for exactly that when a model genuinely cannot identify a source — and
`test/salvage.test.ts` now pins both halves. Teeth checked: restoring the fallback makes the new test
fail.

Everything else came back clean, and the specific things checked are worth recording so they are not
re-checked from scratch: no key in git history (the `sk-AbCdEf…` hit is the `redact()` test fixture),
the test files that repoint `GONKA_BASE_URL` at a local server run in their own processes and cannot
affect a real run, no `server-only` import reached the client components, `/api/history` exposes only
what the permalinks already show and the panel discloses, every attempt and every backoff is
re-clipped against the shared deadline, a caller abort is classified non-retryable, the salvage
accepts only JSON literally present in the raw response, and `ProbeSweep`'s coordinates are all
rounded.

### design-critic: NO, four defects — three real, one not

**1. The Next.js dev-mode route badge was occluding real copy on four of six screens.** True, and worse
than it sounds: it sits *on* the page bottom-left rather than beside it, landing mid-word in the first
probe card at 1536px. Invisible in production and visible in every screenshot, every QA capture and
every take of the pitch video, all of which are recorded against `next dev`. `devIndicators: false`
in `next.config.ts` — compile and runtime errors are still surfaced. Confirmed gone by crop of the
same screen position.

**2. "The row icon and arrow are centred on the title, not the card." Does not reproduce.** Measured
rather than eyeballed, by reading the bounding boxes out of the live DOM:

```
rowH 87   rowMid 43   titleMid 27
idleRowIcon    mid 43
idleRowMain    mid 43
idleRowAction  mid 43
```

They are centred on the row to the pixel, on both tabs. `titleMid: 27` is exactly the position the
review described them as occupying, and they are not at it. Left alone, and recorded here rather
than quietly changed — a review finding that is factually wrong should be answered with the
measurement, not with a change that makes the reviewer feel heard.

**3. "NO SIGNAL" was wearing MiniMax's identity violet.** True and worth fixing. `--neutral`
(`#a78bfa`) and MiniMax's hue (`#b57af8`) are one violet family, and the landing page shows the rail
and the MiniMax satellite at once — so the hue that exists to let a reader follow one model down the
page was doing unrelated duty as a verdict label. The rail's verdict words for UNRESOLVED and NO
SIGNAL are grey now, which also says what those two labels are: an absence, not a finding. A note in
`components/palette.ts` says violet is spoken for.

**4. The sweep's head was the brightest thing on the ring, brighter than an answered seat.** True,
and the sharpest finding of the four: on a frame reading `0/9 NODES ANSWERED`, the single bright spot
was where the wedge crossed the ring, so a reader could take "a node has answered" off a glow that
meant nothing of the kind. Brightness cannot carry two meanings on one shape. The sweep is now steel
(`#72dcff`, the hue this design already spends on a reading in progress) and an answered seat has a
white core. Verified on a frame with four of nine landed: four bright green-ringed white seats, five
dark sockets, and a steel wedge that is plainly a different object.

Getting that frame was itself a problem worth solving. Three live runs in a row were captured at
`0/9` — the router's prep phase alone outlasted the screenshot window — so `tools/live-ui-check.mjs`
now replays a stored run's own SSE events into the page with `/api/verify` stubbed. Everything above
the network is real: the real component, the real stream parsing, the real state machine, the real
sphere. It costs no inferences, and it makes the half-filled frame reproducible instead of lucky.

### The 429 backoff, caught working

A run made immediately after several back-to-back live passes hit the router's rate limit hard — and
the receipts show exactly what the backoff is for:

```
mirror  Kimi-K2.6                attempts=2  19.6s  ok
mirror  MiniMax-M2.7             attempts=3  18.0s  ok
mirror  DeepSeek-V4-Flash-0731   attempts=3  18.6s  ok
direct  MiniMax-M2.7             attempts=3   1.3s  error — rate limiting
```

Three probes rode out the window and came back; the ones that did not had spent their attempts
before it cleared. Under the old 700 ms base every one of those would have failed inside three
seconds. This is the same self-inflicted congestion recorded above — a judge clicking verify once
does not produce it — but it is the first time the mechanism has been observed rescuing a probe
rather than merely being argued for.

The last measurement on a rested router remains the honest headline number: 36 probes, one failure.

### design-critic, re-check: DESIGN SIGN-OFF: YES

All three real findings confirmed fixed by pixel sample rather than by my say-so:

- the dev badge gone from the landing page, and the Probe-01 copy it used to sit on fully legible;
- the rail's verdict word at `rgb(147,154,153)`, a neutral grey, against MiniMax's satellite core at
  `rgb(146,114,210)`;
- and the ring at four of nine: four seats reading a pure white core `rgb(250,251,250)`, five unlit
  at `rgb(3, 20–33, 13–21)`, and the sweep's brightest pixel `rgb(108,209,241)` — steel, not white.
  Brightness now means exactly one thing.

**The reviewer retracted findings 2 and 5** after measuring the card's real borders rather than an ad
hoc crop, and said so plainly: icon centre, arrow centre and card centre land within a pixel. Both
of us were measuring; only one of us was measuring the right thing first time.

Its one open item — every report-route capture on hand predated the `devIndicators` fix, so the badge
was only *proven* gone on two routes — is now closed. `/r/g9v4y253arnw` re-shot three ways
(`report-full.png`, `arith.png`, `witness-reasoning-trace.png`), and in all three the closing
tagline (then "a quorum is the number of independent witnesses…", since replaced by the NEFF one)
reads with its leading "a" intact and
nothing over it.

Two watch items recorded, neither a defect and neither actioned:

- On the report page the metrics strip's violet verdict pill and the panel's violet MiniMax avatar
  can both fall in one scroll position, though not in the fixed single glance the landing rail
  forced. Left as is; the collision that mattered was the one where a reader could not avoid seeing
  both at once.
- The sweep's steel (`#72dcff`) and DeepSeek's satellite blue (`~rgb(105,162,221)`) are both blue,
  visibly different — the sweep reads more cyan. Nowhere near the violet collision, and the reviewer
  explicitly did not ask for a change.

---

## judge-simulator, scoped to these four changes — three findings, all acted on

Asked for a hostile read of the four changes only, and specifically asked whether the arithmetic
defence survives contact. It did not, on a detail that matters more than the argument.

### 1. The flagship honesty feature was quoting a number about itself that was already wrong

`components/Arithmetic.tsx` printed, in present tense, in every report: *"Across the **534**
cross-model anchor pairs this build has stored…"* — a hardcoded string. The reviewer ran
`npm run sweep:threshold`, the tool that same sentence invites the reader to run, and got **552**.
`lib/score.ts` still said **243**, a third number. `ITERATION_LOG.md` and `METHOD.md` each carried a
different snapshot again.

This is the exact failure `CLAUDE.md` exists to prevent, turned inward: not a number taken from a bad
source, but a number about our own corpus that rots on its own. And the panel that prints it is the
one whose entire point is that you can check its arithmetic.

Fixed by taking the count out of anything that can go stale. The shipped UI and the README now make
the *ordering* claim — which is stable and is the actual argument — and point at
`npm run sweep:threshold` for live figures. `lib/score.ts`'s comment carries no counts and says why.
`METHOD.md` keeps a table, now stamped **86 runs, 552 pairs, 61 measurable** with an explicit warning
that the tool will print something different.

### 2. The seat ring was a counter in costume, and the comment above it said otherwise

The sharpest finding. `lit = i < landed` fills the ring clockwise in the identical order on every
run, regardless of which node answered — so it could never show a gap, while the comment directly
above claimed *"the gaps between lit seats say the thing this whole product is about"*. A judge who
watched two runs would have caught the product asserting something it did not know.

Fixed properly rather than by deleting the claim: `seatsFor()` in `RunHero` assigns each of the nine
probes a fixed seat (three per model, in panel order) and lights that seat when **that** probe comes
back. Replaying a real run's recorded arrival order now produces gaps in seven of its nine
intermediate states:

```
 1 ...#.....
 2 ...#..#..  <- gap
 3 #..#..#..  <- gap
 5 #.##..#.#  <- gap
 8 #####.###  <- gap
 9 #########
```

`evidence/iteration/live-working-orb-zoom.png` is that run at four of nine: four lit seats scattered
around the ring with dark sockets between them, not a clockwise arc. The comment is true now, and
carries a note saying not to replace the array with a length again.

### 3. "Most checked" was our own QA corpus dressed as demand

Every row on a fresh clone is a claim named in this log as a test case. Nothing fabricated — they are
real runs — but a list headed "most checked" reads as other people's interest, on a landing page
whose whole pitch is measured honesty. The lead now says it: *"What this instance has been asked
about most, this build's own test runs included."*

### Two overclaims in METHOD.md, also named and also fixed

- *"κ = 1 is the weakest non-trivial choice"* — false as written, since κ is continuous and 0.3 is
  both weaker and non-trivial. It is the smallest *whole* pseudo-observation, which is a narrower and
  defensible claim, and that is what it says now.
- *"the conventional weakly-informative default"* sat between two properly-cited standards (Kish
  1965, Gelman) and borrowed their register without a citation of its own. Now labelled as our
  reading of standard practice.
- And the argument against κ = 2 — *the highest effective witness count we have ever recorded is
  2.08, so κ = 2 would empty the top band* — reasons from this tool's own output distribution to
  justify this tool's own parameter. That is circular, the reviewer was right to say so, and
  `METHOD.md` now says so itself and marks the non-circular half of the case as the one that carries
  the weight.

### What the reviewer confirmed rather than faulted

The direction-of-bias argument for 0.6 reproduces on the larger corpus. The 429 backoff constants
match the code. The deadline-clipping fix is real and matches its description. 2.08 is still the
maximum across twelve more runs than when it was first written. The idle rail is a clear improvement
on a panel of em-dashes — by the component's own admission that the old state was "a report of a run
that has not happened".

### Checking the parser fix did not cost anything

Requiring the probe's own key could in principle turn healthy answers into failures, so it was
replayed over every captured 200 response from this session's raw harness — 62 of them, real
router output — comparing the old path against the new:

```
captured 200-responses: 62   usable now: 59   unusable now: 3   newly failing: 0
```

Nothing that used to parse now fails. The three unusable ones are the truncated MiniMax responses
that were already unusable and are now the retry-and-salvage path's problem rather than the parser's.
The only behavioural change is the intended one: an object missing the field the probe asked for no
longer arrives as a successful witness that "named no source".

---

## Where item 2 actually ended up

Every stored run since the first fix commit — 53 runs, 477 probes — classified by why each failed
probe failed:

| failures | cause |
|---|---|
| 63 | router rate limit (429) — this session's own testing volume |
| 31 | client timeout — router congestion |
| 12 | router HTTP error, i.e. the Kimi 400, before it started working again |
| 9 | node spent its whole budget inside `<think>`; retried with a doubled budget, no draft to salvage, its working surfaced instead of an error |
| **0** | **parse failure** |

That last row is the point of item 2. Before this session a probe could be lost because the parser
could not read what came back, because a timeout was never retried, or because a truncated response
was cached and replayed forever. Since the fixes, **not one probe in 477 has been lost to parsing**.
Every remaining failure is the router being slow, rate-limiting, or refusing a model it advertises —
none of which is ours, and all of which the report shows on its face.

The nine token-ceiling exhaustions are the honest floor of the mechanism: the model really did run
out of room before writing an answer, the app really did ask again with more room, and what it could
not recover it reported as unanswered while keeping the model's own reasoning on screen.

### The same four claims, measured three times on three different router moods

| router state | probes | failed | note |
|---|---|---|---|
| rested | 36 | 1 | the honest headline |
| partly congested | 36 | 5 | all five timeouts on `mirror` probes |
| hammered by this session | 36 | 20 | 429s on most of the first wave |

The middle row has a pattern worth knowing: the mirror probe is the least cache-eligible of the
three, because its text is a *generated* negation and claim preparation occasionally produces a
different wording for the same input (14 runs of the Anglo-Zanzibar claim yielded 1 distinct claim
but 2 distinct negations). So the mirror is the probe most exposed to cold router latency — and it is
also the probe whose loss costs the witness entirely, since without it independence cannot be
measured at all. The app degrades correctly when that happens (`NO SIGNAL`, "the mirror probe did not
return"), and the gate already sends mirrors out in the first wave ahead of the anchors. Recorded
rather than tuned: the fix for a congested router is to wait, not to move numbers around.

---

## Round two — five changes asked for after the first pass

### The rotating sweep is gone, and so is the text inside the sphere

Both removed for the same reason the spinner was never there: the wedge swept at a fixed 2.6s lap
that had nothing to do with the run, so it was decoration wearing the clothes of telemetry, and it
pulled the eye off the seats, which are the part that is true. The count printed over the middle said
the same thing the ring already said, in text the reader has to parse.

What is left in the centre is a core on one beat in three layers, slightly out of phase: a
gradient-filled body, a ring breathing against it, and a wider halo behind both. It encodes nothing —
the seats carry all the progress — so it can be pure liveness without asserting anything.

Verified in the browser rather than by eye: `centreReads: null` (no text), the animation list now
`seatWait ×5, coreBody, coreHalo, corePulse` and `spin` down from 14 to 13 with `sweepRotor` gone.
Four passes on the core before it read as a glow rather than a flat disc — the first was so dim the
screenshot barely caught it, the third overshot and its halo reached the seat ring.

`orbWorking*` in the CSS and `SWEEP_ARC` / `SWEEP_HUE` / `sweepRotor` are deleted rather than left
behind; the project rule is no dead code.

### The rail no longer stretches the page

Both lists are capped at five rows by one `ROWS` constant in the history route, and `.idleList` has a
fixed height with the list scrolling inside it. Measured: the landing page is **1264px on both tabs**,
where it was 1408 and changed when the reader switched — the rail was dictating the page height.

A row cut in half by the bottom edge reads as a layout bug, so the last 1.6rem fades. The same cut
then reads as what it is: the list continues.

### Both lead paragraphs removed

The tabs and the rows say what the lists are. Re-verified after the markup change: five rows on each
tab, five link rows on the recent one, the box still fills and focuses, and `verifyRequestsFired: 0`.

### The probe cards, halved

| card | before | after |
|---|---|---|
| 01 the claim | 26 words | 16 |
| 02 the mirror | 41 words | 23 |
| 03 the evidence | 40 words | 23 |

Every card lost a clause that restated its own title. The hooks kept: *"Every other fact checker
stops here"*, *"reading the sentence, not the fact"*, *"unanimous can mean 1.1"*.

---

## The concurrency limit, and two measurements that lied

The router's refusal reads *"too many concurrent requests for this account; lower your parallelism
and retry"*. `MAX_IN_FLIGHT` was 6. Finding the right number took three passes, and the first two
were wrong in instructive ways.

**Pass one — one-word answers.** Batches of N simultaneous requests, unique nonce so nothing could
be a cache hit, 20s between batches so a rate window could not be mistaken for a concurrency limit.
Clean to 6; one refusal at 8. Conclusion drawn: ceiling between 6 and 8.

That conclusion was worthless. A one-word answer holds its socket for about a second, and a limit on
*simultaneous* sockets is not found by requests that barely overlap.

**Pass two — real probe prompts**, so a socket is held the tens of seconds a real probe holds it:

| in flight | answered | refused |
|---|---|---|
| 4 | 11 of 12 | 0 |
| 5 | 15 of 15 | 0 |
| 6 | 18 of 18 | 0 |
| 7 | 13 of 21 | **7** |

Looked decisive. It was not: a second batch at 7 came back 6 of 7 with no refusals at all, so the
boundary moved between batches — which is the tell that it is not a boundary.

**Pass three — after five idle minutes**, levels 3 to 6: **no concurrency refusal at any level.** The
only refusals were two Cloudflare 502s at 6, which is the upstream having a bad minute rather than
the account being over a limit.

### What that actually means

The refusal is not a property of one verification's width. Nine probes at six wide does not trip it
alone. What trips it is several things hitting one key at once — a second tab, a test harness, a
health check.

The most convincing demonstration of that was self-inflicted: after setting the gate to 5 I ran the
suite immediately, and got **22 refusals out of 36 probes**, every one of them naming concurrency.
The gate was *narrower* than the setting that had worked. What had changed was that a 7-wide
measurement had finished seconds earlier. That run measured my own tail, not the app — the same trap
`PROGRESS.md` already warns about for timeouts, walked straight into.

### Why 5 anyway

Not as a fix for a bug at 6, because there is no bug at 6. As a smaller share of a budget the whole
account shares. The cost was measured rather than assumed, by replaying the real probe latencies of
95 stored runs through this gate:

| window | median phase | slower than 6 |
|---|---|---|
| 4 | unchanged | 46 of 95 runs, worst +10.9s |
| 5 | unchanged | 28 of 95 runs, worst +9.2s |
| 6 | — | — |

The median does not move at any width, because the phase is bounded by the single slowest probe
(median 8.8s) rather than by throughput (median 20.5s of work spread across the remaining slots).
Narrowing the window only bites in the tail. Five pays that tail a third of the time to leave a slot
for everything else on the key; four pays it half the time for headroom nothing measured here asks
for.

The receipt now also distinguishes the two refusals. A rate limit is a window that clears on its own;
a concurrency refusal says the account is asking for more sockets than it may hold, which is
something this app controls. Calling both "rate limiting this burst of probes" hid exactly the
distinction that made this measurable.
