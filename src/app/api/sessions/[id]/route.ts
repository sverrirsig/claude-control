import { NextResponse } from "next/server";
import { getSessionDetail } from "@/lib/discovery";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const detail = await getSessionDetail(params.id);
    if (!detail) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error("Failed to get session detail:", error);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}
