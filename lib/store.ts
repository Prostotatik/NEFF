/**
 * Where finished verifications live so they can be shared by link.
 *
 * A fact check nobody can send to anyone else is not much use in public, and a
 * judge will want to reopen the report after the demo. Runs are written as JSON
 * under `.runs/` — no database to stand up before the app works, and the files
 * are readable by hand, which is the right property for something whose whole
 * pitch is auditability.
 */

import "server-only";
import { mkdir, readFile, readdir, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { PopularClaim, RunSummary, VerificationRun } from "./types.ts";

/**
 * Where new runs are written.
 *
 * On a serverless host the deployment directory is read-only and only `/tmp` can
 * be written, so writing next to the source would make every finished
 * verification unshareable — the report renders once in the browser and its
 * permalink 404s. `/tmp` is per-instance and does not outlive it, which is the
 * honest limit of a no-database design; the seed directory below is what keeps
 * the landing page from being empty on a cold instance.
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

export async function saveRun(run: VerificationRun): Promise<void> {
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
  // Runs written by this instance first, then the committed seed. A run that
  // exists in both is the same run, so the order only decides which copy is
  // read, never which answer is given.
  for (const dir of [RUN_DIR, SEED_DIR]) {
    try {
      const raw = await readFile(path.join(dir, `${id}.json`), "utf8");
      const stored = JSON.parse(raw) as { schema?: number; run?: VerificationRun };
      if (stored.schema !== SCHEMA || !stored.run) continue;
      return stored.run;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Everything the idle page needs about the runs already on disk.
 *
 * Re-read at most once every few seconds: the directory is small, but the
 * landing page asks for this on every load and a demo day is a lot of loads.
 * The cache is per-process and deliberately short — a run finished ten seconds
 * ago should show up in the recent list without a restart.
 */
const HISTORY_TTL_MS = 5_000;
let historyCache: { at: number; runs: RunSummary[] } | null = null;

async function summaries(): Promise<RunSummary[]> {
  if (historyCache && Date.now() - historyCache.at < HISTORY_TTL_MS) return historyCache.runs;

  const listed = await Promise.all(
    [RUN_DIR, SEED_DIR].map((dir) =>
      // A missing directory is not an error: on a cold instance nothing has been
      // written yet, and a checkout without seeds is a valid state too.
      readdir(dir).catch(() => [] as string[]),
    ),
  );
  const files = [...new Set(listed.flat())];

  const runs: RunSummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const run = await loadRun(file.slice(0, -5));
    // loadRun already rejects a run written by an older schema, which is what
    // keeps a stale file out of a list whose entries all have to be openable.
    if (!run) continue;
    runs.push({
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
    });
  }

  runs.sort((a, b) => b.createdAt - a.createdAt);
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
