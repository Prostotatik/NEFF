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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: RunEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of verify(input)) {
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
        closed = true;
        controller.close();
      }
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
