import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { pid } = (await request.json()) as { pid: number };

    if (!pid || typeof pid !== "number") {
      return NextResponse.json({ error: "Missing or invalid pid" }, { status: 400 });
    }

    try {
      process.kill(pid, "SIGTERM");
      await new Promise((r) => setTimeout(r, 1000));
      try {
        process.kill(pid, 0);
        process.kill(pid, "SIGKILL");
      } catch {
        // Already dead
      }
    } catch {
      // Process doesn't exist or already dead — that's fine
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
