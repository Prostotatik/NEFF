# Submission checklist

The organizers ask for exactly three things. This is where each of them stands and, where anything is
left, the single command that finishes it.

## 1. Live Demo URL

> *"A web app where users can paste a link/text and get a verification report."*

The app is built and runs. What it needs is a public address.

**Fastest, no account:**

```bash
./init.sh --check              # confirm the key and the router first
npm run build && npm start     # terminal 1 — the production app on :3000
npm run share                  # terminal 2 — prints a public https URL
```

Use the production build, not `./init.sh`: the dev server is slower and paints a development
indicator into the corner of every screenshot.

Paste that URL into the submission form. It is live for as long as both terminals are, and it is
genuinely public — close it when judging is over. Anyone with the link spends the Gonka key's
credits, eleven inferences at a time (`/api/verify` is rate limited per client, but that is a speed
bump, not a lock).

**If judging happens later, deploy properly instead** — four commands on Vercel, in
[`docs/DEPLOY.md`](docs/DEPLOY.md). That needs the team's own Vercel login, which is the one thing
this build could not do for itself.

## 2. GitHub Repository

> *"Clean code with clear documentation on the Gonka Router integration."*

Done. `origin` points at the team's repository, the history contains no key (`.env` has been
git-ignored since the first commit), and the Gonka integration is documented in
[`docs/GONKA.md`](docs/GONKA.md) — including the two grep commands a reviewer can run to confirm that
no other inference provider exists anywhere in the tree.

```bash
git push -u origin main
```

## 3. Video Pitch

> *"A 2-minute video showing a 'Live Fact-Check' in action."*

**Already recorded: `evidence/pitch/pitch.mp4`** — 1 minute 45, two live fact-checks against the
Gonka Router, ending on a unanimous panel that Quorum scores at zero effective witnesses.

To record a fresh take:

```bash
./init.sh                 # terminal 1
npm run record:pitch      # terminal 2 — rewrites evidence/pitch/pitch.mp4
```

It drives Chrome, runs live verifications against the router, and holds each shot for exactly as long
as its narration line takes to speak. Nothing in it is staged or animated, and it checks its own take
against what the page ended up showing.

The narration is synthesised by the system voice, which is serviceable and obviously not a person. If
you would rather have a human read it — and you should, it is worth the ten minutes — the same run
also writes `evidence/pitch/silent.mp4`, and the script to read over it is
[`VIDEO_PITCH.md`](VIDEO_PITCH.md), which is the identical prose.

---

## Before you submit

```bash
./init.sh --check   # the Gonka Router is reachable and the key is loaded
npm test            # 50 unit tests
npm run test:live   # 4 tests against the live router
npm run build       # production build
```

And the one thing worth doing by hand: run a verification and open the receipt ledger. If the request
ids and node ids are populated there, the deployment is genuinely talking to the Gonka Network.
