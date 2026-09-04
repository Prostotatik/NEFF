# PROGRESS

Running log. Newest session at the top. Record what broke and what did **not** work — that is the
part that saves the next session, which has no memory of this one.

---

## Session 2 — 2026-09-04 — the app, then three rounds of adversarial review

### Built

Quorum is a working Next.js app. `./init.sh` brings it up; a verification is 11 inferences on the
Gonka Router, streamed to the browser as each node answers. `lib/score.ts` holds the argument;
everything else serves it. Commits `a3eda87`, `e64e3a9`, `030ba9c`, `b6541f4`.

### Gonka Router facts learned the hard way (do not re-derive these)

- **Next.js stalls the completion request without `cache: "no-store"`.** The identical payload
  returned in 3s via curl and in a plain Node script, and hung for the full 90s timeout inside a
  route handler. This cost an hour. It is fixed in `lib/gonka.ts`; do not remove that option.
- **Nine concurrent probes draw 429s and Cloudflare 524s.** Gated at four in flight, with retry and
  backoff. Retries are counted on the receipt.
- **Chain of thought is billed against `max_tokens`.** MiniMax emits it inline in `<think>`; Kimi
  returns it in a separate `reasoning` field on the message. Too small a budget and either returns
  `finish_reason: "length"` with *empty content*. Both now get room, and `reasoning` is captured into
  the ledger.
- **Kimi-K2.6 reasons at ~13 tok/s and spends ~2000 tokens a probe** — that alone put a run past four
  minutes. `chat_template_kwargs: { thinking: false }` brings the same probe back in seconds. Tested
  and working on the router.
- **Router latency varies enormously with load.** The same claim ran in 3.8s, 23s, and 102s at
  different times of day, and individual probes occasionally hang far past their normal latency.
  Hence per-model timeouts near the slowest *healthy* response, plus a 75s ceiling on the whole probe
  phase. Do not "fix" a slow run by raising the timeouts; that is what caused the four-minute runs.
- **Anchor prompt wording decides whether the mechanism works at all.** Asking for "specific sources"
  made MiniMax return `[]` with an honest note about not wanting to hallucinate citations, which left
  overlap unmeasurable on most runs. Asking instead for "the body of evidence this rests on", with an
  explicit "you are not being asked for a citation", got all three models naming comparable evidence
  bases. That change is what produced the 89%-overlap demo.

### What did NOT work

- A multi-file `bash` heredoc batch fails to parse and writes **nothing**, silently. Write files one
  at a time, or via a `python` script file — not a `python - <<'PY'` heredoc containing awkward
  quoting either; that failed too. `patch_*.py` files in the scratchpad are the reliable route.
- The Claude-in-Chrome extension is **not connected** on this machine. Browser QA is done instead
  with headless Chrome plus a small CDP driver over `WebSocket` (see the qa-tester agent file); it
  clicks real buttons, reads console errors, and screenshots. It works well — do not waste time
  retrying the extension.
- Project subagents in `.claude/agents/` were **not loaded** this session, because they were created
  after the session started. They were invoked by passing the agent file as the prompt to a
  general-purpose agent, which worked. A fresh session should get them natively.
- `node --test "test/*.test.ts"` needs `--conditions=react-server`, or every module importing
  `server-only` throws. TypeScript parameter properties (`constructor(readonly x)`) are not supported
  by Node's type stripping.

### Review findings acted on (all three agents)

The full lists are in `JUDGE_FEEDBACK.md` and the dated section of `PRIOR_ART.md`. The ones that
changed the product:

1. **A citation was wrong.** The `r ≈ 0.77` figure this project quoted is not in arXiv:2604.07650. It
   came from a search summary that had conflated sources, and I repeated it in the README, the code
   comments and the video script without reading the abstract. Corrected everywhere, and
   `ASSUMED_OVERLAP` re-derived from a figure I have now actually read. **Read the abstract before
   quoting a number.**
2. **Compound claims broke the mirror probe.** On the Streisand-effect URL the extracted claim was
   four assertions joined together, and MiniMax refuted both it and its negation *coherently* — it
   accepted the lawsuit and disputed the $50M. Quorum threw its vote out and told the user it was
   "reading the shape of the sentence". Claim preparation now demands an atomic claim.
3. **Kish's formula misbehaves below k = 1**, reporting more effective witnesses than nominal ones.
4. **SSRF was check-then-fetch**, splittable by a DNS answer that differs between the two lookups.
   The guard now wraps the socket's own resolver.

### Later in the same session

- **All 18 `FEATURES.json` entries are verified end to end** by `qa-tester`, with screenshot evidence
  under `evidence/qa/`. It found two real bugs a green test suite had missed: URL fetching completely
  broken by the SSRF hardening, and literal private IPs bypassing that guard entirely because Node
  connects to an IP without consulting the socket's DNS lookup.
- **The video exists.** `evidence/pitch/pitch.mp4`, 1:45, recorded by `tools/record-pitch.mjs` driving
  the real app through two live verifications, narrated by the Windows speech synthesiser. Three
  things had to be fixed to get a usable take, all recorded in that commit: per-segment assembly (the
  first take ran 2:48 because one router wait added 63s of silence), holding static shots (a
  screencast emits no frames when nothing repaints), and `awaitVerdict` matching the previous run's
  report.
- **The hero result got better on its own.** Re-running the Anglo-Zanzibar claim produced all three
  models answering SUPPORTED to the claim *and* to its negation: 3/3 nominal, 0.0 effective witnesses,
  NO SIGNAL. That report is the README image and the payoff shot in the video.
- **Cross-lingual**: the panel answers in the language of the claim. That immediately exposed a silent
  bug — anchor tokenisation stripped all CJK, so three models citing the same Apollo material scored
  as *fully independent* under a "measured" label. Anchors are now requested in English (a shared
  comparison vocabulary) and tokenisation is script-aware regardless.
- **Pushed** to `origin` (`github.com/Prostotatik/GONKA_TRACK.md`).

## Phase 8 — where the definition of done actually stands (2026-09-04)

Checked one item at a time, with the evidence for each. Two are open and neither is a code problem.

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | Every `FEATURES.json` entry genuinely passes, verified by `qa-tester` | **done** | 18/18, each with a screenshot path or observed transcript in the file. Two passes; the first found URL verification completely broken. |
| 2 | Every rule and submission requirement in the brief satisfied | **open** | §2 and §3 all satisfied (see `JUDGING_CRITERIA.md`). Of the three §5 deliverables: the video exists, the repo is pushed **but private**, and there is **no live demo URL**. |
| 3 | `judge-simulator` has no unaddressed critical finding | **1 of 3 fixed since, 2 are item 2** | second pass scored **86/100**, up from 74, with three criticals: the private repo and the ephemeral live URL (both item 2 below), and **demo latency**, which it timed at 174.6s. That one is fixed — every phase of a run is now bounded and probes are gated at six in flight; a cold uncached claim measures **55.2s** with all eleven calls succeeding, a warm one 2.5s. A third pass should confirm it. |
| 4 | `prior-art-scout`'s final pass finds no unanswered lookalike | **done** | `PRIOR_ART.md`, second dated section: `GATE: PASS`. Its two recommendations — concede that consistency-probing is published, and describe the witness count as a floor rather than a calibrated number — are now in the README. |
| 5 | `design-critic` signs off on the rendered demo | **done** | `DESIGN SIGN-OFF: YES`, after one `NO` whose five blocking defects were all fixed. |
| 6 | Gonka works live, no key in git history | **done** | `npm run test:live` 9/9 against the router; `git log -p --all` contains only a placeholder and a redaction test fixture. |
| 7 | A README a judge can read in ninety seconds | **done** | the image, the video link, and a six-paragraph block covering problem, why not the obvious approach, how it works, how to see it, and why it is not a reskin — about 100 seconds; depth below it. |
| 8 | Clean repo, `init.sh` brings up a working demo from a clean checkout | **done** | exercised from a `git archive` extract with no `.env`: it explains itself, installs, checks the router, exits 0. No TODOs, no debug prints, no dead exports. |

### The two open items, stated plainly

**The repository is private.** An anonymous fetch of
`https://github.com/Prostotatik/GONKA_TRACK.md` returns 404, so a judge cannot read the code the
submission points at. Settings → General → Change visibility → Public. Nothing in the tree is
sensitive; that was verified before pushing.

**A reviewing subagent published the app and left it published.** The second `judge-simulator` pass
ran `npm run share` to check the live-URL criterion, opening a public tunnel that was still running
afterwards. Three processes were stopped, and all three reviewing agents now carry an explicit
instruction never to publish, tunnel, deploy or push. See `DECISIONS.md` D14. **If you re-run a
reviewing agent, check afterwards that nothing is still listening**:
`Get-CimInstance Win32_Process -Filter "Name like '%node%'" | Where-Object { $_.CommandLine -like '*localtunnel*' }`

**There is no Live Demo URL.** `npm run share` produces one in thirty seconds with no account, and
Vercel is four commands — both in `SUBMISSION.md`. This build did not open a public tunnel on its
own: it exposes the Gonka key's credits to anyone with the link, and a URL that dies with the
terminal is worse in a submission form than an empty field. `DECISIONS.md` D9, D12, D13.

Until those two are done the submission is incomplete, and no further code changes that.

### Next session

1. `./init.sh --check`, then a verification, before touching anything.
2. Read the Phase 8 table above. Two items are open and both are one human action.
3. If anything in the product changed, re-run `qa-tester` on the features it touched and
   `design-critic` on the screens it touched — every agent pass so far has found something real.
4. If the pitch needs re-recording, `npm run record:pitch` checks its own take and will tell you when
   the router gave it a result the narration does not match.

---

## Session 1 — 2026-09-04 — harness + concept lock

### Done

- Read the brief in full. Quoted its judging criteria verbatim into `JUDGING_CRITERIA.md` and derived
  a weighted checklist (C1–C12) from them.
- Probed the Gonka Router live. Findings below.
- Ran the Phase 0 originality search. Result: the naive build for this challenge **has already won a
  comparable hackathon** (Flare Fact Checker — multi-node verifiers, correctness score, sources).
  Concept locked on a mechanism that inverts it. See `PRIOR_ART.md` and `DECISIONS.md` D3.
- Wrote the harness: `CLAUDE.md`, `FEATURES.json` (18 entries, all `passes: false`), `init.sh`,
  `DECISIONS.md`, `.claude/agents/` (5 subagents).
- `.env` created and git-ignored in the first harness commit; key never written into a tracked file.

### Gonka Router facts (measured, not assumed)

- `GET /v1/models` returns **3** models:
  `deepseek-ai/DeepSeek-V4-Flash-0731`, `MiniMaxAI/MiniMax-M2.7`, `moonshotai/Kimi-K2.6`.
- API is OpenAI-compatible (`POST /v1/chat/completions`, `Authorization: Bearer`).
- **The Gonka Request ID is in the response headers, not the body.** Header `x-request-id`
  (e.g. `req-1788473643105856296-578027`). The body's `id` field is instead
  `devshard-<node>-<seq>`, and header `x-devshard-id` gives the serving node id.
  → Both must be captured, which means the HTTP layer cannot use a client that discards headers.
  → This is a gift for criterion C6: we can show *which decentralized node* served each inference,
    not merely a request id.
- Response body carries `usage` (prompt/completion/total tokens) and `system_fingerprint`
  (e.g. `vllm-0.25.1-...`).

### What did NOT work / traps found

- **`moonshotai/Kimi-K2.6` is slow.** A trivial 20-token completion did not return inside the
  remaining ~60s of a 2-minute budget. Do not call the three models sequentially — the demo would
  stall for minutes. All probes must be fired concurrently with a per-call timeout.
- **`MiniMaxAI/MiniMax-M2.7` emits `<think>…</think>` prose before its answer** and will burn the
  whole `max_tokens` budget inside the think block if the budget is small. With `max_tokens: 20` it
  returned only reasoning and `finish_reason: "length"` — no answer at all.
  → Generous `max_tokens`, and a parser that strips think blocks before looking for JSON.
- A multi-file `bash` heredoc batch failed to parse (`unexpected EOF while looking for matching '`)
  and wrote **nothing**, silently. Write agent/markdown files one at a time with the Write tool
  rather than batching heredocs.

### Next session picks up here

1. `./init.sh --check` must pass before anything else.
2. Build `lib/gonka.ts` — the single Gonka client, capturing `x-request-id` and `x-devshard-id`.
3. Then the probe engine, then the SSE route, then the UI. One `FEATURES.json` entry at a time.

### Open gaps requiring a human (not dropped — see `DECISIONS.md`)

- **D8** Video pitch: script and shot list are shippable by this agent; the recording is not.
- **D9** Live Demo URL: needs the team's hosting account. Build is deploy-ready and documented.
