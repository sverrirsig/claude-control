import { NextResponse } from "next/server";
import { discoverSessions } from "@/lib/discovery";
import { areHooksInstalled, ensureHooksInstalled } from "@/lib/hooks-installer";

export const dynamic = "force-dynamic";

let hookInstallAttempted = false;

export async function GET() {
  try {
    if (!hookInstallAttempted) {
      hookInstallAttempted = true;
      await ensureHooksInstalled();
    }

    const sessions = await discoverSessions();
    return NextResponse.json({ sessions, hooksActive: areHooksInstalled() });
  } catch (error) {
    console.error("Failed to discover sessions:", error);
    return NextResponse.json({ sessions: [], hooksActive: false, error: "Discovery failed" }, { status: 500 });
  }
}
