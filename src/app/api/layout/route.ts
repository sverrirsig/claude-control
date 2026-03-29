import { loadDashboardLayout, saveDashboardLayout } from "@/lib/dashboard-layout";
import { NextResponse } from "next/server";

export async function GET() {
  const layout = await loadDashboardLayout();
  return NextResponse.json(layout);
}

export async function PUT(request: Request) {
  const body = await request.json();
  await saveDashboardLayout(body);
  return NextResponse.json({ ok: true });
}
