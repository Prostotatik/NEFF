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
import type { VerificationRun } from "./types.ts";

const RUN_DIR = path.join(process.cwd(), ".runs");
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
  try {
    const raw = await readFile(path.join(RUN_DIR, `${id}.json`), "utf8");
    const stored = JSON.parse(raw) as { schema?: number; run?: VerificationRun };
    if (stored.schema !== SCHEMA || !stored.run) return null;
    return stored.run;
  } catch {
    return null;
  }
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
