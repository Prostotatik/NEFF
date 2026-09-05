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
