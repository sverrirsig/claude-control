import { getSessionDetail } from "@/lib/discovery";

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Padding comment forces the initial TCP chunk past Node.js's internal buffer
      // threshold (~4 KB), ensuring the browser receives the connection immediately.
      controller.enqueue(encoder.encode(`: ${"x".repeat(2048)}\n\n`));

      try {
        while (true) {
          try {
            const detail = await getSessionDetail(id);
            if (!detail) {
              controller.enqueue(
                encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "Session not found" })}\n\n`)
              );
            } else {
              controller.enqueue(
                encoder.encode(`event: session\ndata: ${JSON.stringify(detail)}\n\n`)
              );
            }
          } catch {
            controller.enqueue(
              encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "Failed to load session" })}\n\n`)
            );
          }

          await sleep(1000);
        }
      } catch {
        // Client disconnected — controller.enqueue threw; exit cleanly.
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
