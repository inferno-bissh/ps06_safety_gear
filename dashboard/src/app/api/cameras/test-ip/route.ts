import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let rawInput = (body.ip || body.url || "").trim();

    if (!rawInput) {
      return NextResponse.json({ success: false, message: "No IP address or stream URL provided" }, { status: 400 });
    }

    // Auto-normalize input into a valid HTTP URL
    let streamUrl = rawInput;
    if (!streamUrl.startsWith("http://") && !streamUrl.startsWith("https://") && !streamUrl.startsWith("rtsp://")) {
      // If it's a bare IP or ip:port (e.g. 192.168.1.5 or 192.168.1.5:8080)
      if (!streamUrl.includes(":")) {
        streamUrl = `http://${streamUrl}:8080/video`;
      } else if (!streamUrl.includes("/")) {
        streamUrl = `http://${streamUrl}/video`;
      } else {
        streamUrl = `http://${streamUrl}`;
      }
    }

    // Attempt rapid probe to test reachability
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const startTime = Date.now();
    try {
      // If /video, test root first or stream directly
      const probeTarget = streamUrl.endsWith("/video") ? streamUrl.replace("/video", "/status.json") : streamUrl;
      const res = await fetch(probeTarget, {
        method: "GET",
        signal: controller.signal,
        headers: { "User-Agent": "SafetyIntel-CameraProbe/1.0" },
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        reachable: true,
        streamUrl,
        latencyMs,
        status: res.status,
        message: `Camera reachable (${latencyMs}ms)`,
      });
    } catch {
      // Fallback: try fetching the streamUrl directly with stream cancel
      try {
        const directController = new AbortController();
        const directTimeout = setTimeout(() => directController.abort(), 2000);
        const resDirect = await fetch(streamUrl, {
          method: "GET",
          signal: directController.signal,
        });
        clearTimeout(directTimeout);
        const latencyMs = Date.now() - startTime;
        return NextResponse.json({
          success: true,
          reachable: true,
          streamUrl,
          latencyMs,
          status: resDirect.status,
          message: `Stream connection established (${latencyMs}ms)`,
        });
      } catch {
        // If fetch aborted or failed, return unreachable
        return NextResponse.json({
          success: false,
          reachable: false,
          streamUrl,
          message: `Unable to connect to ${rawInput}. Verify Wi-Fi network and ensure IP Webcam server is running.`,
        });
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unknown probe error";
    return NextResponse.json({ success: false, message: errorMsg }, { status: 500 });
  }
}
