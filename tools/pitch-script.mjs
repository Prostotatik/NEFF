/**
 * The two-minute pitch, as data.
 *
 * Each segment pairs a line of narration with what the browser should be doing
 * while it is spoken. `tools/record-pitch.mjs` measures how long each line
 * actually takes to speak and drives the app to match, so the picture and the
 * words stay in sync without anyone counting seconds by hand.
 *
 * Two segments wait for a live verification to come back from the router. Their
 * narration is written to cover that wait, because how long it takes is not up
 * to us — and dead air while a spinner turns is the fastest way to lose a judge.
 *
 * The prose here and in VIDEO_PITCH.md must stay the same. If you change one,
 * change the other.
 */

/**
 * @typedef {object} Segment
 * @property {string} id
 * @property {string} say          narration; "" for a silent beat
 * @property {number} [hold]       extra seconds to stay on this shot after the line
 * @property {string} [act]        an action name handled by record-pitch.mjs
 * @property {string} [arg]        argument for the action
 */

/** @type {Segment[]} */
export const SEGMENTS = [
  {
    id: "open",
    act: "goto",
    arg: "/",
    say: "Every A I fact checker works the same way. Ask several models, count the votes, print a confidence score. The whole promise is that independent models agreed.",
  },
  {
    id: "problem",
    say: "They are not independent. Frontier models share training data and make the same mistakes. Measure a panel of nine of them, as a twenty twenty six paper did, and you get about two independent votes worth of information.",
    hold: 0.5,
  },
  {
    id: "mechanism",
    act: "scrollTo",
    arg: "mechanism",
    say: "So Quorum does not count votes. It asks every model three questions. The claim. The claim negated, put back blind. And what evidence it is leaning on.",
    hold: 0.6,
  },
  {
    id: "run",
    act: "clickExample",
    arg: "0",
    say: "Here is a live check.",
  },
  {
    id: "wait",
    act: "awaitVerdict",
    say: "Eleven inferences, every one of them on the Gonka Network, streaming back from independent nodes as they land.",
  },
  {
    id: "payoff",
    act: "scrollTo",
    arg: "verdict",
    say: "Three out of three models agreed. And that agreement is worth about one witness, because all three lean on the same Cochrane reviews. One witness, quoted three times. The score is discounted to match, and it shows you its own arithmetic.",
    hold: 1.2,
  },
  {
    id: "url",
    act: "runInput",
    arg: "https://en.wikipedia.org/wiki/Streisand_effect",
    say: "Now a link instead of a claim.",
  },
  {
    id: "wait2",
    act: "awaitVerdict",
    say: "Quorum pulls out the checkable assertion and probes the panel again.",
  },
  {
    id: "echo",
    act: "scrollTo",
    arg: "verdict",
    say: "And here it catches what a vote never could. One model answered the same way to the claim and to its negation. It is reading the shape of the sentence, not the fact, so its vote is thrown out, and both answers are shown.",
    hold: 1.2,
  },
  {
    id: "ledger",
    act: "openLedgerRow",
    say: "Every inference carries a Gonka request I D and the node that served it. Expand a row and you get the exact request and the raw response. Re-run that step against the same gateway yourself.",
    hold: 1.5,
  },
  {
    id: "close",
    act: "goto",
    arg: "/",
    say: "Consensus is not evidence. Quorum tells you how many witnesses it actually had, and shows you the one it had to throw out.",
    hold: 1.5,
  },
];
