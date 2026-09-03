# 2-minute video pitch — script and shot list

The submission requires a two-minute video showing a live fact-check. Everything below is ready to
record; recording it takes about ten minutes and needs a human with a microphone and a screen
recorder. Nothing here is a mockup — every number quoted has been observed in a real run against the
live Gonka Router, and the two example claims reproduce it.

## Before recording

```bash
./init.sh                 # confirms the router is reachable, starts on :3000
```

Open `http://localhost:3000` (or the deployed URL) at 1440px wide, dark room, no browser chrome
clutter. Have the second example ready to paste. Do one throwaway run first so the router is warm —
a cold first call adds several seconds.

**Do not** show a browser tab with `.env` open, and do not open devtools: the request bodies in the
ledger contain no key, but a network panel would show the Authorization header.

## Script

**0:00–0:15 — the problem, stated as a fact about the tools, not a slogan**

> Every AI fact checker works the same way. Ask several models, count the votes, print a confidence
> score. The whole promise is that independent models agreed.
>
> They are not independent. Frontier models share training data, and their errors correlate at about
> 0.77 — three models are worth roughly one and a third. Which means these systems are most confident
> exactly when the models are wrong together.

*Shot: the Quorum landing page, static. The headline on screen is doing this work for you.*

**0:15–0:30 — what Quorum measures instead**

> Quorum doesn't count votes. It asks every model three questions: the claim, the claim negated and
> presented blind, and what evidence it's leaning on. Then it reports how many independent witnesses
> are actually behind the verdict.

*Shot: click the first example — "Taking vitamin C supplements prevents the common cold."*

**0:30–0:55 — the live check, running**

> Eleven inferences, all of them on the Gonka Network, streaming back from independent nodes as they
> land.

*Shot: the probe grid filling in out of order. Let it run; do not cut. Point at the receipt counter
climbing. This is where the decentralisation is visible rather than asserted.*

**0:55–1:20 — the first payoff: unanimous, and worthless**

> Three out of three models agreed. And that agreement is worth 1.1 witnesses — because all three
> are leaning on the same Cochrane reviews. Eighty-nine percent measured evidence overlap. One
> witness, quoted three times.
>
> The truth score is discounted to match, and it shows you its own arithmetic.

*Shot: the verdict card. Hold on the steel 3/3 next to the sodium 1.1 for a full two seconds — this
is the frame a judge should still remember at the end of the day. Then the derivation in the left
column.*

**1:20–1:45 — the second payoff: a model that wasn't reading**

*Shot: paste the Wikipedia link (`https://en.wikipedia.org/wiki/Streisand_effect`), run it.*

> Now a link instead of a claim. Quorum pulls out the checkable assertion, then probes the panel —
> and catches something a vote never could.
>
> MiniMax answered "refuted" to the claim, and "refuted" to its negation. It's responding to the
> shape of the sentence, not to the fact. That vote carries no information, so it's thrown out — and
> here is the transcript of both answers, side by side.

*Shot: the "Vote thrown out" callout, then scroll to the panel row showing "on the claim: REFUTED"
above "on its negation: REFUTED".*

**1:45–2:00 — the proof, and the close**

*Shot: scroll to the receipt ledger and expand one row.*

> Every inference has a Gonka request id and the id of the node that served it. Click any row and you
> get the exact request and the raw response — re-run it against the same gateway yourself.
>
> Consensus isn't evidence. Quorum is the only fact checker that tells you when its own panel
> shouldn't be trusted.

## Shot list, in order

1. Landing page, static, 1440px — the headline
2. Click example 1 → probe grid filling out of order (do not cut away)
3. Verdict card: 3/3 steel beside 1.1 sodium — hold two seconds
4. Left column: the derivation
5. Paste the Wikipedia URL → extracted claim appears
6. "Vote thrown out" callout
7. Panel row: REFUTED on the claim, REFUTED on the negation
8. Receipt ledger, one row expanded: request id, node id, raw transcript
9. End on the landing headline

## Numbers quoted, and where they come from

| Claim in the script | Source |
|---|---|
| errors correlate at ≈ 0.77; three models ≈ 1.3 independent | arXiv:2604.07650, cited in `PRIOR_ART.md` and `README.md` |
| 3/3 agreed, 89% overlap, 1.1 effective witnesses | live run of example 1; reproducible from the home screen |
| MiniMax answers REFUTED to both claim and negation | live run of the Streisand-effect URL; reproduced across separate runs |
| 11 inferences per verification | `lib/verify.ts`, and the ledger totals on every report |

If a live run on the day produces different numbers, **say the numbers on screen** — do not read this
script over a different result. The models are not deterministic across router nodes, and the point
of the product is that it reports what actually happened.
