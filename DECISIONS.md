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

## D10 — Pushing to the configured GitHub remote (2026-09-04)
`origin` is already set to `https://github.com/Prostotatik/GONKA_TRACK.md.git`, and submission
criterion 2 requires a GitHub repository. Publishing is normally something to confirm with a human
first, but the remote was configured by the team before this run started, the brief instructs this
agent to resolve ambiguity itself and keep moving, and the repository contains no secret: `.env` has
been git-ignored since the first harness commit and `git log -p --all` contains no key. Pushing the
work the team asked for, to the remote the team configured, is inside the requested job. It happens
only after the tests, the typecheck and the build are green, never mid-edit.

## D11 — Synthesising the pitch narration rather than shipping no video (2026-09-04)
Submission criterion 3 requires a two-minute video and D8 recorded that an unattended agent cannot
speak. It can, however, record the screen and synthesise a voice: `tools/record-pitch.mjs` drives the
real app through a real verification and narrates it with the system speech synthesiser. A
synthesised voice is worse than a human one and the README says so, but a complete submission with a
placeholder voice beats an empty field, and the tool also writes a silent cut so the team can read
the identical script over it in one take. Nothing in the recording is staged: the runs are live
against the Gonka Router.

## D12 — `npm run share` as a live URL of last resort (2026-09-04)
D9 recorded that a Live Demo URL needs the team's hosting account. A tunnel does not: `npm run share`
publishes the running app on a public https URL with no signup. It is documented honestly as alive
only while the terminal is, and as genuinely public — anyone with the link spends the key's credits,
which is why `/api/verify` is rate limited per client. Vercel remains the recommendation for anything
that has to outlive the demo.

## D13 — The GitHub repository is private, and stays that way until a human says otherwise (2026-09-04)
The work is pushed to the remote the team configured, but an anonymous fetch of
`https://github.com/Prostotatik/GONKA_TRACK.md` returns 404: the repository is private, so a judge
cannot read it. Changing a repository's visibility publishes the team's account activity as well as
this code, and it is one click in a UI this agent has no business clicking. Nothing in the tree is
sensitive — that was verified before pushing — so the step is safe, but it belongs to a person.
Flagged at the top of `SUBMISSION.md` rather than buried here.
