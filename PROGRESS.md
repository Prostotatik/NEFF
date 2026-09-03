# PROGRESS

Running log. Newest session at the top. Record what broke and what did **not** work — that is the
part that saves the next session, which has no memory of this one.

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
