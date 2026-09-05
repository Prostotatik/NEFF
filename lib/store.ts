/**
 * Where finished verifications live so they can be shared by link.
 *
 * A fact check nobody can send to anyone else is not much use in public, and a
 * judge will want to reopen the report after the demo. Runs are written as JSON
 * — no database to stand up before the app works, and the files are readable by
 * hand, which is the right property for something whose whole pitch is
 * auditability.
 *
 * There are two backends, chosen by the environment rather than by a flag:
 *
 * - **Files under `.runs/`** when running locally. Nothing to configure, and the
 *   runs are sitting there to `cat` while developing.
 * - **A Vercel Blob store** when `BLOB_READ_WRITE_TOKEN` is set. A serverless
 *   deployment has no shared disk — each instance gets its own `/tmp` — so a run
 *   saved by one instance is invisible to the next, and its permalink 404s from
 *   any other. That was observed on the deployed app before this existed: the
 *   report rendered, the share link did not.
 *
 * Either way `runs-seed/`, committed to the repo, is merged in read-only so a
 * cold start has a history to show.
 */

import "server-only";
import { mkdir, readFile, readdir, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";
import type { PopularClaim, RunSummary, VerificationRun } from "./types.ts";

/**
 * The blob store is used when its token is present, which on Vercel is whenever
 * a store is linked to the project. Locally there is no token and no reason for
 * one: the filesystem is shared with the next request.
 */
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const usingBlob = Boolean(BLOB_TOKEN);

const BLOB_RUNS = "runs/";
const BLOB_INDEX = "runs/index.json";

/**
 * Where new runs are written when there is no blob store.
 *
 * On a serverless host the deployment directory is read-only and only `/tmp` can
 * be written, so this still has to move — it is the fallback for a deployment
 * with no store linked, and one instance's history is better than none.
 */
const RUN_DIR = process.env.VERCEL
  ? path.join("/tmp", "neff-runs")
  : path.join(process.cwd(), ".runs");

/**
 * Runs committed to the repo, read-only, merged into the history.
 *
 * These are real verifications, written by this app against the real router, not
 * fixtures — the same files `.runs/` holds, copied in so a fresh deployment has
 * a history to show and its permalinks resolve. Nothing is ever written here.
 */
const SEED_DIR = path.join(process.cwd(), "runs-seed");

const MAX_RUNS = 200;

/**
 * Bump whenever the shape of a stored run changes. A report written by an older
 * build is served as "not found" rather than rendered from fields that no longer
 * exist — a 404 on a stale link is honest; a half-rendered verdict is not.
 */
const SCHEMA = 3;

const ID_PATTERN = /^[a-z2-9]{6,16}$/;

function isValidRunId(id: string): boolean {
  return ID_PATTERN.test(id);
}

function summarise(run: VerificationRun): RunSummary {
  return {
    id: run.id,
    input: run.input,
    inputKind: run.inputKind,
    claim: run.prep.claim,
    createdAt: run.createdAt,
    truthScore: run.verdict.truthScore,
    label: run.verdict.label,
    effectiveWitnesses: run.consensus.effectiveWitnesses,
    nominalAgree: run.consensus.nominalAgree,
    respondents: run.consensus.respondents,
  };
}

function parseStored(raw: string): VerificationRun | null {
  try {
    const stored = JSON.parse(raw) as { schema?: number; run?: VerificationRun };
    if (stored.schema !== SCHEMA || !stored.run) return null;
    return stored.run;
  } catch {
    return null;
  }
}

// --- blob backend ------------------------------------------------------------

async function blobText(pathname: string): Promise<string | null> {
  try {
    // `useCache: false` because both of these are read straight after being
    // written — a run the reader just watched finish, and an index that gained a
    // row a second ago. A cached miss here reads as data loss.
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return await new Response(result.stream).text();
  } catch {
    // Missing blob, expired token, store unreachable: none of them are worth
    // failing a page render over.
    return null;
  }
}

async function blobPut(pathname: string, body: string): Promise<void> {
  await put(pathname, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/**
 * The history is one blob, not a listing.
 *
 * Listing the store and opening every run would be a hundred round trips on a
 * landing page that asks for this on load. The index is written alongside each
 * run and holds only the summary fields the lists actually render; the full run
 * is fetched only when a report is opened.
 */
async function blobIndex(): Promise<RunSummary[]> {
  const raw = await blobText(BLOB_INDEX);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { schema?: number; runs?: RunSummary[] };
    if (parsed.schema !== SCHEMA || !Array.isArray(parsed.runs)) return [];
    return parsed.runs;
  } catch {
    return [];
  }
}

async function blobSave(run: VerificationRun): Promise<void> {
  await blobPut(`${BLOB_RUNS}${run.id}.json`, JSON.stringify({ schema: SCHEMA, run }));

  // Read-modify-write. Two verifications finishing in the same second could lose
  // a row here, and the run itself is still saved and still openable by link
  // when that happens — the index is a convenience, not the record.
  const current = (await blobIndex()).filter((entry) => entry.id !== run.id);
  const next = [summarise(run), ...current]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_RUNS);
  await blobPut(BLOB_INDEX, JSON.stringify({ schema: SCHEMA, runs: next }));

  const dropped = current.filter((entry) => !next.some((kept) => kept.id === entry.id));
  if (dropped.length) {
    await del(
      dropped.map((entry) => `${BLOB_RUNS}${entry.id}.json`),
      { token: BLOB_TOKEN },
    ).catch(() => {});
  }
}

// --- filesystem backend ------------------------------------------------------

async function fileRun(dir: string, id: string): Promise<VerificationRun | null> {
  try {
    return parseStored(await readFile(path.join(dir, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

async function fileSummaries(dir: string): Promise<RunSummary[]> {
  // A missing directory is not an error: on a cold instance nothing has been
  // written yet, and a checkout without seeds is a valid state too.
  const files = await readdir(dir).catch(() => [] as string[]);
  const runs: RunSummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const run = await fileRun(dir, file.slice(0, -5));
    // A run written by an older schema is skipped, which is what keeps a stale
    // file out of a list whose entries all have to be openable.
    if (run) runs.push(summarise(run));
  }
  return runs;
}

// --- public API --------------------------------------------------------------

export async function saveRun(run: VerificationRun): Promise<void> {
  if (usingBlob) {
    await blobSave(run);
    return;
  }
  await mkdir(RUN_DIR, { recursive: true });
  await writeFile(
    path.join(RUN_DIR, `${run.id}.json`),
    JSON.stringify({ schema: SCHEMA, run }),
    "utf8",
  );
  await prune();
}

export async function loadRun(id: string): Promise<VerificationRun | null> {
  if (!isValidRunId(id)) return null;

  if (usingBlob) {
    const raw = await blobText(`${BLOB_RUNS}${id}.json`);
    const run = raw ? parseStored(raw) : null;
    if (run) return run;
  }

  // Then this instance's own writes, then the committed seed. A run that exists
  // in more than one place is the same run, so the order only decides which copy
  // is read, never which answer is given.
  return (await fileRun(RUN_DIR, id)) ?? (await fileRun(SEED_DIR, id));
}

/**
 * Everything the idle page needs about the runs already stored.
 *
 * Re-read at most once every few seconds: the landing page asks for this on
 * every load and a demo day is a lot of loads. The cache is per-process and
 * deliberately short — a run finished ten seconds ago should show up in the
 * recent list without a restart.
 */
const HISTORY_TTL_MS = 5_000;
let historyCache: { at: number; runs: RunSummary[] } | null = null;

async function summaries(): Promise<RunSummary[]> {
  if (historyCache && Date.now() - historyCache.at < HISTORY_TTL_MS) return historyCache.runs;

  const sources = await Promise.all([
    usingBlob ? blobIndex() : fileSummaries(RUN_DIR),
    fileSummaries(SEED_DIR),
  ]);

  // Stored runs win over seeds of the same id, which is what makes a seeded run
  // that was later re-checked show its newer self.
  const byId = new Map<string, RunSummary>();
  for (const run of sources.flat()) if (!byId.has(run.id)) byId.set(run.id, run);

  const runs = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  historyCache = { at: Date.now(), runs };
  return runs;
}

/** The most recently finished verifications, newest first. */
export async function recentRuns(limit = 6): Promise<RunSummary[]> {
  return (await summaries()).slice(0, limit);
}

/**
 * What has been checked most often.
 *
 * Grouped by the input as submitted rather than by the extracted claim: two
 * people pasting the same sentence are checking the same thing, whereas the
 * extracted claim can differ run to run — claim preparation is itself an
 * inference — and grouping on it would split one popular claim into near
 * duplicates. The most recent run of each group carries the label shown, and its
 * id is what a reader opens if they want the report rather than a re-run.
 */
export async function popularClaims(limit = 5): Promise<PopularClaim[]> {
  const groups = new Map<string, PopularClaim>();

  for (const run of await summaries()) {
    const key = run.input.trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    // `summaries()` is newest first, so the first sighting of a key is also the
    // latest run of it, which is the one whose verdict is worth showing.
    groups.set(key, {
      input: run.input,
      inputKind: run.inputKind,
      claim: run.claim,
      count: 1,
      latestId: run.id,
      latestLabel: run.label,
      latestScore: run.truthScore,
    });
  }

  return [...groups.values()]
    // Ties broken by nothing in particular would reshuffle the list on every
    // load, so a stable second key: the claim text.
    .sort((a, b) => b.count - a.count || a.claim.localeCompare(b.claim))
    .slice(0, limit);
}

/** Keep the run directory from growing without bound during a long demo day. */
async function prune(): Promise<void> {
  try {
    const files = await readdir(RUN_DIR);
    if (files.length <= MAX_RUNS) return;
    const stamped = await Promise.all(
      files.map(async (file) => ({
        file,
        mtime: (await stat(path.join(RUN_DIR, file))).mtimeMs,
      })),
    );
    stamped.sort((a, b) => a.mtime - b.mtime);
    for (const { file } of stamped.slice(0, stamped.length - MAX_RUNS)) {
      await unlink(path.join(RUN_DIR, file)).catch(() => {});
    }
  } catch {
    // Pruning is housekeeping; never let it break a verification.
  }
}
