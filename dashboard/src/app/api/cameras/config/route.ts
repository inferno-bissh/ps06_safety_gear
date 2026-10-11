import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import net from "net";

function getProjectRoot() {
  let projectRoot = process.cwd();
  if (!fs.existsSync(path.join(projectRoot, "camera_config.json"))) {
    if (fs.existsSync(path.join(projectRoot, "..", "camera_config.json"))) {
      projectRoot = path.resolve(projectRoot, "..");
    }
  }
  return projectRoot;
}

function loadConfig(): Record<string, any> {
  const root = getProjectRoot();
  const cfgPath = path.join(root, "camera_config.json");
  if (fs.existsSync(cfgPath)) {
    try {
      return JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    } catch {
      // Fallback
    }
  }
  return {
    cctv1: "0",
    cctv2: "http://192.168.1.5:8080/video",
    cctv2_ip: "192.168.1.5",
    cctv2_port: 8080,
    cctv2_endpoint: "/video",
    updated_at: new Date().toISOString(),
  };
}

function saveConfig(updates: Record<string, any>) {
  const root = getProjectRoot();
  const cfgPath = path.join(root, "camera_config.json");
  const current = loadConfig();
  const merged = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

function probeTcpPort(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

// GET: Return saved camera configuration and live hardware/stream connection status
export async function GET() {
  const config = loadConfig();
  let liveStatus: Record<string, any> | null = null;
  let orchestratorOnline = false;

  try {
    const res = await fetch("http://localhost:5000/api/cameras/status", {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      liveStatus = await res.json();
      orchestratorOnline = true;
    }
  } catch {
    orchestratorOnline = false;
  }

  return NextResponse.json({
    success: true,
    config,
    orchestratorOnline,
    liveStatus,
  });
}

// POST: Validate IP, probe camera reachability, persist to camera_config.json,
// and dynamically update the active stream in Python without restarting CCTV 1
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = (body.action || "connect").toLowerCase();
    const channel = (body.channel || "cctv2").toLowerCase();

    // 1. Handle Disconnect action
    if (action === "disconnect") {
      saveConfig({
        [`${channel}_status`]: "DISCONNECTED",
      });

      // Notify Python orchestrator
      try {
        await fetch("http://localhost:5000/api/cameras/source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, action: "disconnect" }),
          signal: AbortSignal.timeout(1500),
        });
      } catch {}

      return NextResponse.json({
        success: true,
        action: "disconnect",
        message: `${channel.toUpperCase()} stream disconnected to standby mode.`,
      });
    }

    // 2. Format & normalize camera input
    let rawInput = (body.ip || body.url || "").trim();
    if (!rawInput) {
      const cfg = loadConfig();
      rawInput = cfg[channel] || "http://192.168.1.5:8080/video";
    }

    let streamUrl = rawInput;
    let ipOnly = "";
    let portNum = 8080;
    let endpoint = "/video";

    if (!streamUrl.startsWith("http://") && !streamUrl.startsWith("https://") && !streamUrl.startsWith("rtsp://")) {
      if (streamUrl.includes(":")) {
        const parts = streamUrl.split(":");
        ipOnly = parts[0];
        const portPart = parts[1].split("/")[0];
        portNum = parseInt(portPart, 10) || 8080;
        endpoint = parts[1].includes("/") ? "/" + parts[1].split("/").slice(1).join("/") : "/video";
        streamUrl = `http://${ipOnly}:${portNum}${endpoint}`;
      } else {
        ipOnly = streamUrl;
        portNum = body.port ? parseInt(body.port, 10) : 8080;
        endpoint = body.endpoint ? (body.endpoint.startsWith("/") ? body.endpoint : `/${body.endpoint}`) : "/video";
        streamUrl = `http://${ipOnly}:${portNum}${endpoint}`;
      }
    } else {
      try {
        const parsed = new URL(streamUrl);
        ipOnly = parsed.hostname;
        portNum = parseInt(parsed.port, 10) || 8080;
        endpoint = parsed.pathname || "/video";
      } catch {
        ipOnly = rawInput.replace(/^https?:\/\//, "").split(":")[0];
      }
    }

    // Auto-normalize phone camera endpoints on port 8080 or 4747
    if (streamUrl.startsWith("http://") && (streamUrl.endsWith(":8080") || streamUrl.endsWith(":8080/"))) {
      streamUrl = streamUrl.replace(/\/+$/, "") + "/video";
      endpoint = "/video";
    } else if (streamUrl.startsWith("http://") && (streamUrl.endsWith(":4747") || streamUrl.endsWith(":4747/"))) {
      streamUrl = streamUrl.replace(/\/+$/, "") + "/video";
      endpoint = "/video";
    }

    // 3. Probe phone camera reachability
    let isReachable = false;
    let latencyMs = 0;
    const startTime = Date.now();

    // Check TCP port first
    const portOpen = await probeTcpPort(ipOnly, portNum, 1200);
    if (portOpen) {
      isReachable = true;
      latencyMs = Date.now() - startTime;
    } else {
      // Fallback HTTP probe
      try {
        const resProbe = await fetch(streamUrl, {
          method: "GET",
          signal: AbortSignal.timeout(1500),
        });
        isReachable = resProbe.ok || resProbe.status === 200;
        latencyMs = Date.now() - startTime;
      } catch {
        isReachable = false;
      }
    }

    // 4. Persist updated configuration to disk
    const saved = saveConfig({
      [channel]: streamUrl,
      [`${channel}_ip`]: ipOnly,
      [`${channel}_port`]: portNum,
      [`${channel}_endpoint`]: endpoint,
      [`${channel}_status`]: isReachable ? "ONLINE" : "STANDBY",
    });

    // 5. Send dynamic in-process update to Python vision pipeline (Port 5000)
    let dynamicUpdated = false;
    try {
      const resPy = await fetch("http://localhost:5000/api/cameras/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          source: streamUrl,
          action: "connect",
        }),
        signal: AbortSignal.timeout(2000),
      });
      if (resPy.ok) {
        dynamicUpdated = true;
      }
    } catch {
      dynamicUpdated = false;
    }

    return NextResponse.json({
      success: true,
      channel,
      streamUrl,
      ip: ipOnly,
      port: portNum,
      endpoint,
      reachable: isReachable,
      latencyMs,
      dynamicUpdated,
      savedConfig: saved,
      message: isReachable
        ? `Successfully connected to phone camera at ${ipOnly}:${portNum} (${latencyMs}ms)`
        : `Configuration saved for ${ipOnly}:${portNum}. Phone is currently unreachable. Ensure IP Webcam is running and on the same Wi-Fi.`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
