/**
 * The verification stream.
 *
 * Server-sent events rather than a single JSON response: a run makes eleven
 * inferences across independent Gonka nodes and takes tens of seconds, and the
 * receipts arriving one at a time from different node ids is the most honest
 * possible demonstration that the reasoning is not happening on our server.
 */

import { verify } from "@/lib/verify";
import { saveRun } from "@/lib/store";
import type { RunEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_INPUT = 8000;

/**
 * A single anonymous POST spends eleven inferences against our key, so the
 * endpoint is metered per client. In-memory and per-instance, which is the right
 * size for a hackathon demo: it stops one tab hammering the router, and it is
 * not pretending to be a distributed quota.
 */
const RATE_LIMIT = { windowMs: 60_000, maxRuns: 6 };
const recentRuns = new Map<string, number[]>();

function overRateLimit(client: string): boolean {
  const now = Date.now();
  const times = (recentRuns.get(client) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (times.length >= RATE_LIMIT.maxRuns) {
    recentRuns.set(client, times);
    return true;
  }
  times.push(now);
  recentRuns.set(client, times);
  if (recentRuns.size > 5000) recentRuns.clear();
  return false;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export async function POST(request: Request): Promise<Response> {
  let input = "";
  try {
    const body = (await request.json()) as { input?: unknown };
    input = typeof body.input === "string" ? body.input.trim() : "";
  } catch {
    return Response.json({ error: "Expected a JSON body of the form { input: string }." }, { status: 400 });
  }

  if (input.length < 8) {
    return Response.json({ error: "Give me a claim to check — a sentence or a link." }, { status: 400 });
  }
  if (input.length > MAX_INPUT) {
    return Response.json(
      { error: `That is longer than ${MAX_INPUT} characters. Paste the claim, or a link to it.` },
      { status: 400 },
    );
  }
  if (overRateLimit(clientKey(request))) {
    return Response.json(
      {
        error: `That is ${RATE_LIMIT.maxRuns} verifications in a minute, and each one spends eleven inferences on the Gonka Network. Give it a moment.`,
      },
      { status: 429 },
    );
  }

  const encoder = new TextEncoder();
  // The reader is gone once the client navigates away or the connection drops;
  // enqueueing after that throws, and so does closing twice.
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      try {
        // Threading the request signal through means a user who walks away stops
        // spending inference, rather than leaving nine probes running.
        for await (const event of verify(input, request.signal)) {
          if (event.type === "done") {
            await saveRun(event.run).catch(() => {
              // A failed save costs the permalink, not the verification.
            });
          }
          send(event);
        }
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "The verification stopped unexpectedly.",
        });
      } finally {
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed by the client going away.
          }
        }
      }
    },
    cancel() {
      // The client went away. `request.signal` is what actually stops the run;
      // this just makes sure nothing else tries to write to a dead controller.
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
