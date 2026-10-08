import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const res = await fetch("http://localhost:5000/api/workers", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ success: true, workers: data });
    }
    return NextResponse.json({ success: false, workers: [] });
  } catch {
    return NextResponse.json({ success: false, workers: [] });
  }
}
