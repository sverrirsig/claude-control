import { NextResponse } from "next/server";
import { discoverSessions } from "@/lib/discovery";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessions = await discoverSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Failed to discover sessions:", error);
    return NextResponse.json({ sessions: [], error: "Discovery failed" }, { status: 500 });
  }
}
