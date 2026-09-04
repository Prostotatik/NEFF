/**
 * Live proof that the panel is reachable on the Gonka Network.
 * Never returns the key, only whether one is configured.
 */

import { gonkaModels, redact, GONKA_BASE_URL } from "@/lib/gonka";
import { PANEL } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every home-page load asks for this, and each miss costs a keyed call to the
 * router. A short cache keeps the status honest — it is still a live check —
 * without turning page views into router traffic.
 */
const CACHE_MS = 30_000;
let cached: { at: number; body: unknown; status: number } | null = null;

export async function GET(): Promise<Response> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return Response.json(cached.body, { status: cached.status });
  }

  const configured = Boolean(process.env.GONKA_API_KEY);
  try {
    const available = await gonkaModels();
    const body = {
      ok: true,
      gateway: GONKA_BASE_URL,
      keyConfigured: configured,
      available,
      panel: PANEL.map((m) => ({ id: m.id, label: m.label, online: available.includes(m.id) })),
    };
    cached = { at: Date.now(), body, status: 200 };
    return Response.json(body, { status: 200 });
  } catch (error) {
    const body = {
      ok: false,
      gateway: GONKA_BASE_URL,
      keyConfigured: configured,
      // Redacted like every other outward-facing error path: an upstream message
      // is the classic place for a credential to escape.
      error: redact(error instanceof Error ? error.message : "Gonka Router unreachable"),
    };
    cached = { at: Date.now(), body, status: 503 };
    return Response.json(body, { status: 503 });
  }
}
