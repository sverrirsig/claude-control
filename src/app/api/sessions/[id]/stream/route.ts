import { NextRequest } from "next/server";
import { getSessionDetail } from "@/lib/discovery";
import { open } from "fs/promises";
import { watch } from "fs";
import { linesToConversation } from "@/lib/session-reader";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const detail = await getSessionDetail(id);
  if (!detail) {
    return new Response("Session not found", { status: 404 });
  }

  const jsonlPath = detail.jsonlPath;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      send("init", detail);

      if (!jsonlPath) {
        controller.close();
        return;
      }

      let fileOffset = 0;
      try {
        const fh = await open(jsonlPath, "r");
        fileOffset = (await fh.stat()).size;
        await fh.close();
      } catch {
        // file may not exist yet
      }

      let lineBuffer = "";

      const readNewLines = async () => {
        try {
          const fh = await open(jsonlPath, "r");
          const stats = await fh.stat();

          if (stats.size <= fileOffset) {
            await fh.close();
            return;
          }

          const toRead = stats.size - fileOffset;
          const buf = Buffer.alloc(toRead);
          await fh.read(buf, 0, toRead, fileOffset);
          fileOffset = stats.size;
          await fh.close();

          lineBuffer += buf.toString("utf-8");
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              const messages = linesToConversation([parsed]);
              for (const msg of messages) {
                send("message", msg);
              }
            } catch {
              // skip malformed lines
            }
          }
        } catch {
          // file read error, skip
        }
      };

      const watcher = watch(jsonlPath, async (eventType) => {
        if (closed || eventType !== "change") return;
        await readNewLines();
      });

      const pingInterval = setInterval(() => {
        if (closed) {
          clearInterval(pingInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(pingInterval);
        }
      }, 15000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        watcher.close();
        clearInterval(pingInterval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
