/**
 * What has already been checked.
 *
 * The landing page has nothing measured to show before a claim is submitted, and
 * it used to fill that space with the empty shell of a report. This endpoint is
 * what replaces it: the claims this instance has been asked about most, and the
 * checks it finished most recently. Both come from the same `.runs/` directory
 * the permalinks are served from, so every row here opens a real report rather
 * than a rehearsal of one.
 */

import { popularClaims, recentRuns } from "@/lib/store";

/**
 * The same number of rows for both lists, because they share one slot in the
 * rail and a taller list on one tab makes the whole page jump when the reader
 * switches. Five fits the panel without the rail dictating the page height.
 */
const ROWS = 5;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const [popular, recent] = await Promise.all([popularClaims(ROWS), recentRuns(ROWS)]);
    return Response.json(
      { popular, recent },
      // Short-lived and public: this is the same information every visitor sees
      // on the landing page, and it changes as runs finish.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // An unreadable run directory costs the idle panel its lists, nothing more.
    return Response.json({ popular: [], recent: [] }, { status: 200 });
  }
}
