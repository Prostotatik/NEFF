# 2-minute video pitch

`evidence/pitch/pitch.mp4` is the recorded pitch: 1 minute 45, showing two live fact-checks against
the Gonka Router. Nothing in it is a mockup or an animation — it is the real app being driven through
real verifications, and the frames are what the browser actually painted.

## Re-recording it

```bash
./init.sh              # terminal 1: the app on :3000
npm run record:pitch   # terminal 2
```

`tools/record-pitch.mjs` synthesises the narration from `tools/pitch-script.mjs`, then drives Chrome
through the flow below, holding each shot for exactly as long as its line takes to speak.

Two things it does that are worth knowing:

- **It checks its own take.** One line asserts something a live run might not produce — that the
  panel answered the same way to a claim and to its negation. If the run comes out differently the
  tool says so loudly rather than shipping a voiceover talking over a screen showing something else.
- **The two waiting stretches are timelapsed** when the router is slow, so the cut is the length of
  the script rather than the length of the queue that day. Only the waits are compressed, the
  on-screen counter ("N of 11 inferences returned") shows what is happening throughout, and the tool
  prints how many seconds it compressed. Every other second is real time.

## Recording it with a human voice — worth the ten minutes

The same run writes `evidence/pitch/silent.mp4`, the picture with no voice. Read the script below
over it. The synthesised voice is there so the submission is complete without a person, not because
it is better than one.

`tools/pitch-script.mjs` is the canonical narration and is what the recorder speaks. **If you change
a line here, change it there.**

Before recording either way: do one throwaway verification so the router is warm, run the production
build (`npm run build && npm start`) so the dev indicator is not in shot, do not have `.env` visible,
and do not open devtools — the request bodies in the ledger carry no key, but a network panel would
show the Authorization header.

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

**A live check from a link** — *paste `https://en.wikipedia.org/wiki/Streisand_effect`, run it; let
the probe grid fill, do not cut away*

> Here is a live check, from a link.
>
> Quorum reads the page, pulls out the one checkable claim, and probes the panel. Eleven inferences,
> every one of them on the Gonka Network, streaming back from independent nodes as they land.

**What the score means** — *the verdict card, then the derivation in the left column*

> The score is not the vote. It is the vote discounted by how independent those models actually were,
> measured from the evidence each of them named. And it shows you its own arithmetic.

**The payoff** — *run "The Anglo-Zanzibar War of 1896 lasted under forty-five minutes."*

> Now watch what a vote cannot see.
>
> Same panel, same three questions.

*then the verdict card: 3/3 nominal beside 0.0 effective, and the "Vote thrown out" callout*

> All three models said this claim is true. All three also said the opposite is true. They are
> matching a famous fact, not reading the sentence. So every vote is thrown out: three out of three
> agreed, and it is worth zero independent witnesses.

**The proof** — *the receipt ledger, one row expanded*

> Every inference carries a Gonka request ID and the node that served it. Expand a row and you get
> the exact request and the raw response. Re-run that step against the same gateway yourself.

**The close** — *back to the landing headline*

> Consensus is not evidence. Quorum tells you how many witnesses it actually had, and shows you the
> ones it had to throw out.

## Numbers quoted, and where they come from

| Claim in the script | Source |
|---|---|
| nine judges give about two independent votes | arXiv:2605.29800, quoted in `PRIOR_ART.md` and `README.md` |
| all three models affirm the claim and its negation | the live run in the recording; the same result is the screenshot at the top of `README.md` |
| eleven inferences per verification | `lib/models.ts`, and the ledger totals on every report |

If a live run on the day produces different numbers, **say the numbers on screen** — do not read this
script over a different result. The models are not deterministic across router nodes, and the whole
point of the product is that it reports what actually happened.
