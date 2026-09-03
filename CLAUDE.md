# Quorum — durable rules for every session

**Project:** Quorum. Independence-weighted fact verification running entirely on the Gonka Router.
**Win condition:** win the "AI for Society" hackathon (see `JUDGING_CRITERIA.md`, verbatim).

## Start every session with this, in order
1. Read `PROGRESS.md` (what broke, what didn't work — do not re-walk a logged dead end).
2. Read `git log --oneline -15` and `FEATURES.json`.
3. Run `./init.sh` and confirm the app still works **before writing any new code**.
   If it's broken, fixing it is the whole task until it isn't.

## The one-sentence pitch (keep this exact)
Three models agreeing is one witness if they all read the same page — Quorum measures how
independent its verifiers actually are and prices the truth score by it.

## Non-negotiables
- **Gonka only.** Every inference goes through `api.gonkarouter.io`. No other provider may appear in
  the repo, not even commented out. This is a hard requirement of the brief.
- **Never commit the key.** It lives only in `.env` (git-ignored). Never in a log, README, error
  message, screenshot, or client-side bundle. Server-side use only.
- **`passes: true` in `FEATURES.json` requires end-to-end execution**, signed off by `qa-tester`
  against the running app. Never on "the code looks right".
- **Never weaken a test or delete a feature entry to make it pass.**
- **Never invent data, benchmarks or user quotes.** No claim in the README without evidence in repo.
- Commit after every complete unit of work, with a message a stranger could follow.
- Green tests before every commit.

## Design bar (first impression is a judging criterion in practice)
One deliberate visual point of view, applied consistently. No default component-library look.
The hero moment is the **verdict card the instant it reveals a high nominal consensus next to a low
Effective Witness Count** — design toward that screen on purpose. `design-critic` judges rendered
screenshots only, never CSS.

## Subagents (`.claude/agents/`) — run on cadence, not on vibes
`prior-art-scout` (concept lock + before completion) · `judge-simulator` (after every milestone
commit) · `code-reviewer` (fresh eyes on each diff) · `qa-tester` (gates every `passes` flip) ·
`design-critic` (screenshots only).

## Definition of done
`PROMT.md` Phase 8, all eight items, with evidence pointed at for each. When in doubt, not done.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
