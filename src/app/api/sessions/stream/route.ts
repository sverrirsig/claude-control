import { discoverSessions } from "@/lib/discovery";
import { ensureHooksInstalled, areHooksInstalled } from "@/lib/hooks-installer";

export const dynamic = "force-dynamic";

let hookInstallAttempted = false;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Padding comment forces the initial TCP chunk past Node.js's internal buffer
      // threshold (~4 KB), ensuring the browser receives the connection immediately.
      controller.enqueue(encoder.encode(`: ${"x".repeat(2048)}\n\n`));

      try {
        while (true) {
          try {
            if (!hookInstallAttempted) {
              hookInstallAttempted = true;
              await ensureHooksInstalled();
            }
            const sessions = await discoverSessions();
            controller.enqueue(
              encoder.encode(
                `event: sessions\ndata: ${JSON.stringify({ sessions, hooksActive: areHooksInstalled() })}\n\n`
              )
            );
          } catch {
            controller.enqueue(
              encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "Discovery failed" })}\n\n`)
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
