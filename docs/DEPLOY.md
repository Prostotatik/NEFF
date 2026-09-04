# Deploying Quorum

Quorum is a standard Next.js app with no database and no build-time secrets. Anywhere that runs
Node 20+ will serve it; the paths below are the ones that have been prepared for.

## The fastest live URL, with no account at all

If you need a public URL in the next thirty seconds — to put in a submission form, or to hand a judge
mid-demo — tunnel the local app:

```bash
./init.sh                # in one terminal: the app on :3000
npm run share            # in another: prints a public https URL
```

`npm run share` is `npx --yes localtunnel --port 3000`. It gives a real, working, publicly reachable
URL backed by the machine you are sitting at, which is enough for judging and costs nothing.

Two things to be clear-eyed about before you run it. The URL is only live while both that terminal
and the app are running, so it is not a substitute for a real deployment if judging happens later.
And it is genuinely public: anyone with the link can spend your Gonka credits, eleven inferences at a
time. `/api/verify` is rate limited per client, but the sensible thing is to close the tunnel when you
are done. For anything longer-lived, deploy properly below.

## Vercel (recommended — this is the Live Demo URL)

```bash
npm i -g vercel
vercel                                   # link the project, accept the defaults
vercel env add GONKA_API_KEY production  # paste the key when prompted; it is never echoed
vercel --prod
```

That is the whole deployment. No build configuration is needed: `next.config.ts` carries the only
setting that matters in production, a proxy timeout long enough for a verification stream.

Two things to know before the demo:

- **The verification route streams for tens of seconds.** `app/api/verify/route.ts` declares
  `maxDuration = 300`. On Vercel's Hobby plan the ceiling is 60 seconds, which is enough for a
  typical run (measured 4–40s) but not for a run where the router is congested. If you have Pro,
  nothing to do; on Hobby, prefer the example claims, which are the fastest paths.
- **Report permalinks are stored on disk** under `.runs/`, which is ephemeral on serverless. A report
  stays readable for the life of the instance — fine for a demo and for sharing a link during
  judging, and the fix for anything longer is to point `lib/store.ts` at a KV store; it is twenty
  lines behind two functions, `saveRun` and `loadRun`.

## Any Node host (Fly, Render, Railway, a VPS)

```bash
npm ci
npm run build
GONKA_API_KEY=sk-... npm start           # serves on :3000
```

Set `GONKA_API_KEY` in the host's environment, not in a file in the image. `GONKA_BASE_URL` is
optional and defaults to `https://api.gonkarouter.io/v1`.

## Before you call it deployed

```bash
curl -s https://<your-host>/api/health | head -c 400
```

You want `"ok": true` and all three panel models reported `online: true`. The response deliberately
reports whether a key is configured, never the key itself.

Then run one verification end to end from the deployed URL and open the receipt ledger — if the
request ids and node ids are populated there, the deployment is genuinely talking to the Gonka
Network and not to a cached response.
