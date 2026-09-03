/**
 * Live proof that the panel is reachable on the Gonka Network.
 * Never returns the key, only whether one is configured.
 */

import { gonkaModels, GONKA_BASE_URL } from "@/lib/gonka";
import { PANEL } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const configured = Boolean(process.env.GONKA_API_KEY);
  try {
    const available = await gonkaModels();
    return Response.json({
      ok: true,
      gateway: GONKA_BASE_URL,
      keyConfigured: configured,
      available,
      panel: PANEL.map((m) => ({ id: m.id, label: m.label, online: available.includes(m.id) })),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        gateway: GONKA_BASE_URL,
        keyConfigured: configured,
        error: error instanceof Error ? error.message : "Gonka Router unreachable",
      },
      { status: 503 },
    );
  }
}
