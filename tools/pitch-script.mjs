/**
 * The two-minute pitch, as data.
 *
 * Each segment pairs a line of narration with what the browser should be doing
 * while it is spoken. `tools/record-pitch.mjs` measures how long each line takes
 * to speak and drives the app to match, so picture and words stay together
 * without anyone counting seconds by hand.
 *
 * Two segments wait for a live verification to come back from the router. Their
 * narration is written to cover that wait, because how long it takes is not up
 * to us — and dead air while a spinner turns is the fastest way to lose a judge.
 *
 * **The narration is pre-recorded and the runs are live**, so a line must not
 * assert something a run might not produce. Only one segment does — `echo`, on a
 * claim the panel has reliably failed the mirror probe on — and it carries an
 * `expect` that the recorder checks against the finished page. If the run comes
 * out differently the recorder says so loudly rather than shipping a voiceover
 * that talks over a screen showing something else.
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
 * @property {string} [expect]     text that must be on the page, or the take is wrong
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
    say: "So NEFF does not count votes. It asks every model three questions. The claim. The claim negated, put back blind. And what evidence it is leaning on.",
    hold: 0.6,
  },
  {
    id: "url",
    act: "runInput",
    arg: "https://en.wikipedia.org/wiki/Streisand_effect",
    say: "Here is a live check, from a link.",
  },
  {
    id: "wait",
    act: "awaitVerdict",
    say: "NEFF reads the page, pulls out the one checkable claim, and probes the panel. Eleven inferences, every one of them on the Gonka Network, streaming back from independent nodes as they land.",
  },
  {
    id: "payoff",
    act: "scrollTo",
    arg: "verdict",
    say: "The score is not the vote. It is the vote discounted by how independent those models actually were, measured from the evidence each of them named. And it shows you its own arithmetic.",
    hold: 1.2,
  },
  {
    id: "second",
    act: "runInput",
    arg: "The Anglo-Zanzibar War of 1896 lasted under forty-five minutes.",
    say: "Now watch what a vote cannot see.",
  },
  {
    id: "wait2",
    act: "awaitVerdict",
    say: "Same panel, same three questions.",
  },
  {
    id: "echo",
    act: "scrollTo",
    arg: "verdict",
    expect: "NO SIGNAL",
    say: "All three models said this claim is true. All three also said the opposite is true. They are matching a famous fact, not reading the sentence. So every vote is thrown out: three out of three agreed, and it is worth zero independent witnesses.",
    hold: 1.5,
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
    say: "Consensus is not evidence. NEFF tells you how many witnesses it actually had, and shows you the ones it had to throw out.",
    hold: 1.5,
  },
];
