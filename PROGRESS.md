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

### Still open

- **Live Demo URL** (submission criterion 1) and the **video** (criterion 3) both need a human:
  hosting credentials and a microphone. `docs/DEPLOY.md` and `VIDEO_PITCH.md` reduce each to about ten
  minutes of work. See `DECISIONS.md` D8, D9. These are the two highest-value remaining items and no
  amount of code closes them.
- `FEATURES.json` is still all `false` — nothing has been signed off end to end yet.

### Next session

1. `./init.sh --check`, then a verification, before touching anything.
2. Work `FEATURES.json` top to bottom with the qa-tester agent and the CDP driver. Flip only what was
   observed.
3. Re-run judge-simulator and design-critic after that, then the Phase 8 checklist line by line.

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
