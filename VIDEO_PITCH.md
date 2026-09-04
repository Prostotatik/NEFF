# 2-minute video pitch

There are two ways to get the video. Both show the real app running real verifications against the
live Gonka Router; neither involves a mockup.

## The fast way — one command

```bash
./init.sh              # terminal 1: the app on :3000
npm run record:pitch   # terminal 2
```

`tools/record-pitch.mjs` drives Chrome through the flow below, runs two live checks, captures the
frames the browser paints, and narrates it with the system speech synthesiser — holding each shot for
exactly as long as its line takes to speak. It writes `evidence/pitch/pitch.mp4`, about two minutes
long depending on how fast the router is answering.

## The better way — ten minutes and a microphone

The same run also writes `evidence/pitch/silent.mp4`, the picture with no voice. Read the script
below over it. A human voice is worth the ten minutes; the synthesised one is there so the submission
is complete without it, not because it is good.

`tools/pitch-script.mjs` is the canonical narration and is what the recorder speaks. **If you change
a line here, change it there.**

## Before recording, either way

Do one throwaway verification first so the router is warm — a cold first call adds several seconds.
**Do not** have a terminal with `.env` visible on screen, and do not open devtools: the request
bodies in the ledger carry no key, but a network panel would show the Authorization header.

## Script

**The problem** — *landing page, static*

> Every AI fact checker works the same way. Ask several models, count the votes, print a confidence
> score. The whole promise is that independent models agreed.
>
> They are not independent. Frontier models share training data and make the same mistakes. Measure a
> panel of nine of them, as a 2026 paper did, and you get about two independent votes' worth of
> information.

**The mechanism** — *scroll to the three probe columns*

> So Quorum does not count votes. It asks every model three questions. The claim. The claim negated,
> put back blind. And what evidence it is leaning on.

**A live check** — *click the first example chip; let the probe grid fill, do not cut away*

> Here is a live check.
>
> Eleven inferences, every one of them on the Gonka Network, streaming back from independent nodes as
> they land.

**The first payoff** — *the verdict card; hold on the steel 3/3 beside the sodium 1.1*

> Three out of three models agreed. And that agreement is worth about one witness, because all three
> lean on the same Cochrane reviews. One witness, quoted three times. The score is discounted to
> match, and it shows you its own arithmetic.

**A link instead of a claim** — *paste `https://en.wikipedia.org/wiki/Streisand_effect`, run it*

> Now a link instead of a claim.
>
> Quorum pulls out the checkable assertion and probes the panel again.

**The second payoff** — *the "Vote thrown out" callout, then the panel row showing REFUTED above REFUTED*

> And here it catches what a vote never could. One model answered the same way to the claim and to
> its negation. It is reading the shape of the sentence, not the fact, so its vote is thrown out, and
> both answers are shown.

**The proof** — *the receipt ledger, one row expanded*

> Every inference carries a Gonka request ID and the node that served it. Expand a row and you get
> the exact request and the raw response. Re-run that step against the same gateway yourself.

**The close** — *back to the landing headline*

> Consensus is not evidence. Quorum tells you how many witnesses it actually had, and shows you the
> one it had to throw out.

## Numbers quoted, and where they come from

| Claim in the script | Source |
|---|---|
| nine judges give about two independent votes | arXiv:2605.29800, quoted in `PRIOR_ART.md` and `README.md` |
| 3/3 agreed, ~1.1 effective witnesses on the Cochrane reviews | live runs of example 1; reproducible from the home screen |
| one model answers the same way to a claim and its negation | live runs of the Streisand-effect URL; reproduced across separate runs |
| eleven inferences per verification | `lib/models.ts`, and the ledger totals on every report |

If a live run on the day produces different numbers, **say the numbers on screen** — do not read this
script over a different result. The models are not deterministic across router nodes, and the whole
point of the product is that it reports what actually happened.
