import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const res = await fetch("http://127.0.0.1:5000/api/hazard", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ success: true, hazard: data });
    }
    return NextResponse.json({
      success: false,
      hazard: { smoke: false, fire: false, smoke_index: 0.0 },
    });
  } catch {
    return NextResponse.json({
      success: false,
      hazard: { smoke: false, fire: false, smoke_index: 0.0 },
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const targetUrl = body.type === "reset" || body.reset
      ? "http://127.0.0.1:5000/api/hazard/reset"
      : body.type === "fire"
      ? "http://127.0.0.1:5000/api/hazard/fire"
      : "http://127.0.0.1:5000/api/hazard/smoke";

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ success: true, result: data });
    }
    return NextResponse.json({ success: false, error: "Failed to update hazard on port 5000" }, { status: 502 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
