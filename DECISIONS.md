# Decisions log

Ambiguities resolved without a human. Format: decision, reasoning, date.

## D1 — `PROMPT.md` does not exist; the brief is `PROMT.md` (2026-09-04)
The loop prompt refers to `PROMPT.md`. The repo has `PROMT.md` with the mission text.
Treating `PROMT.md` as the operating brief. Phase 8 = `PROMT.md` Phase 8.

## D2 — Gonka is a hard requirement, not a bonus (2026-09-04)
`Hackathon_Challenge_AI-for-Society.md` §2: "All AI reasoning and verification logic **MUST** run on
the Gonka Network via the official inference gateway". Consequence: no other inference provider may
appear anywhere in the repo, and Gonka must be *visibly* used in the demo (request IDs on screen).

## D3 — Concept: independence-weighted verification, not consensus voting (2026-09-04)
See `PRIOR_ART.md`. The naive multi-model-consensus fact checker has already won a comparable
hackathon (Flare Fact Checker), which the organizers' rule marks as already-used. The differentiator
is measuring *verifier independence* at query time. Product name: **Quorum** — a quorum is the number
of genuinely independent members required for a decision to be valid, which is exactly the quantity
the app computes.

## D4 — Three probes per model, not one (2026-09-04)
`direct` (claim as stated), `mirror` (claim negated and presented as the claim under test), and
`anchor` (name the concrete sources you are leaning on). `mirror` catches surface pattern-matching
(a model affirming a claim and its negation carries no information); `anchor` catches shared-source
dependence. 3 models × 3 probes + 1 adjudication = 10 Gonka calls per verification. That call volume
is a feature, not a cost: it makes the Receipt Ledger substantive, and credits are free during the
hackathon (§2 "unlimited free token credits").

## D5 — Mirror probe must be blind (2026-09-04)
The negated claim is presented to the model as if it were the original claim under test, in a fresh
request with no shared context. If the model could see it was a trap, the probe would measure
instruction-following rather than belief. Consequence: each probe is an independent HTTP request.

## D6 — Kimi-K2.6 is slow (>60s observed); all probes run in parallel (2026-09-04)
Sequential execution would take minutes. All 9 probes are fired concurrently and streamed to the UI
over SSE as they land. Per-call timeout with a graceful "model unreachable" state, because a dead
model must degrade the Effective Witness Count, not crash the verification.

## D7 — "Real-time web data": fetched by us, reasoned about on Gonka (2026-09-04)
§2 core functionality allows "real-time web data **or** internal knowledge bases". A URL input is
fetched server-side for its text (that is retrieval, not inference) and all reasoning over it runs on
Gonka. No non-Gonka model is ever called. Documented in `docs/GONKA.md` so a judge can verify the
boundary.

## D8 — Video pitch: script + shot list, not a recorded file (2026-09-04)
Submission criterion 3 requires a 2-minute video. An unattended agent cannot record narration or a
screen capture. `VIDEO_PITCH.md` ships a second-by-second script, shot list, and the exact demo
claims to paste, so recording is a 10-minute human task. Flagged in `PROGRESS.md` as the one
deliverable that requires a human. Not silently dropped.

## D9 — Live Demo URL requires the team's hosting account (2026-09-04)
Submission criterion 1 requires a live URL. Deployment needs credentials this agent does not have.
Mitigation: the app is built deploy-ready (Next.js, zero config on Vercel), `init.sh` brings up a
working local demo from a clean checkout, and `docs/DEPLOY.md` is a two-command path. Flagged in
`PROGRESS.md`.
