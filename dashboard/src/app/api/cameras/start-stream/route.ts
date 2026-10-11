import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";

function isPortActive(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GET: Check if Python Vision Broadcaster on port 5000 is online
export async function GET() {
  const active = await isPortActive(5000);
  return NextResponse.json({
    online: active,
    port: 5000,
    endpoints: {
      cctv1: "http://localhost:5000/video/cctv1",
      cctv2: "http://localhost:5000/video/cctv2",
      composite: "http://localhost:5000/video/composite",
      workers: "http://localhost:5000/api/workers",
    },
  });
}

// POST: Automatically launch Python AI Multi-Camera Orchestrator if offline or reconfigured
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Read persistent camera_config.json if available
    let projectRoot = process.cwd();
    if (!fs.existsSync(path.join(projectRoot, "vision_pipeline"))) {
      if (fs.existsSync(path.join(projectRoot, "..", "vision_pipeline"))) {
        projectRoot = path.resolve(projectRoot, "..");
      }
    }
    const configPath = path.join(projectRoot, "camera_config.json");
    let savedConfig: Record<string, any> = {};
    if (fs.existsSync(configPath)) {
      try {
        savedConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch {}
    }

    let cctv1 = body.cctv1 || savedConfig.cctv1 || "0";
    let cctv2 = body.cctv2 || savedConfig.cctv2 || "http://192.168.1.5:8080/video";
    const cctv3 = body.cctv3;
    const cctv4 = body.cctv4;

    // Sanitize against broadcast URLs containing :5000
    if (String(cctv1).includes(":5000")) cctv1 = savedConfig.cctv1 || "0";
    if (String(cctv2).includes(":5000")) cctv2 = savedConfig.cctv2 || "http://192.168.1.5:8080/video";

    // Auto-normalize phone camera endpoints on port 8080 or 4747
    if (String(cctv2).startsWith("http://") && (String(cctv2).endsWith(":8080") || String(cctv2).endsWith(":8080/"))) {
      cctv2 = String(cctv2).replace(/\/+$/, "") + "/video";
    } else if (String(cctv2).startsWith("http://") && (String(cctv2).endsWith(":4747") || String(cctv2).endsWith(":4747/"))) {
      cctv2 = String(cctv2).replace(/\/+$/, "") + "/video";
    }

    let alreadyActive = await isPortActive(5000);

    // If already active and forceRestart requested, terminate old instance cleanly
    if (alreadyActive && body.forceRestart) {
      try {
        const { execSync } = await import("child_process");
        execSync(
          `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`,
          { stdio: "ignore" }
        );
        await sleep(1000);
        alreadyActive = await isPortActive(5000);
      } catch (e) {
        console.warn("[start-stream] Error stopping existing orchestrator:", e);
      }
    }

    if (alreadyActive && !body.forceRestart) {
      // Forward dynamic stream update to live Python orchestrator on port 5000
      let dynamicSwitched = false;
      try {
        const resSource = await fetch("http://localhost:5000/api/cameras/source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "cctv2", source: cctv2, action: "connect" }),
          signal: AbortSignal.timeout(1500),
        });
        dynamicSwitched = resSource.ok;
      } catch {}

      return NextResponse.json({
        success: true,
        alreadyRunning: true,
        isOnline: true,
        dynamicSwitched,
        message: dynamicSwitched
          ? `Python Vision Orchestrator updated dynamically to: ${cctv2}`
          : "Python Vision Orchestrator is active on port 5000",
        port: 5000,
        urls: {
          cctv1: "http://localhost:5000/video/cctv1",
          cctv2: "http://localhost:5000/video/cctv2",
        },
      });
    }

    // Determine project root directory robustly
    if (!fs.existsSync(path.join(projectRoot, "vision_pipeline"))) {
      if (fs.existsSync(path.join(projectRoot, "..", "vision_pipeline"))) {
        projectRoot = path.resolve(projectRoot, "..");
      }
    }
    const scriptPath = path.join(projectRoot, "vision_pipeline", "multicam_orchestrator.py");

    const args = [
      scriptPath,
      "--cctv1-gate", String(cctv1),
      "--cctv2-front", String(cctv2),
      "--no-gui",
    ];
    if (cctv3) args.push("--cctv3-side-left", String(cctv3));
    if (cctv4) args.push("--cctv4-side-right", String(cctv4));

    console.log(`[API /start-stream] Launching Python orchestrator: python ${args.join(" ")}`);

    const child = spawn("python", args, {
      cwd: projectRoot,
      detached: true,
      stdio: "ignore",
      shell: true,
    });
    child.unref();

    // Wait up to 4.5s for port 5000 to bind
    let isUp = false;
    for (let i = 0; i < 8; i++) {
      await sleep(600);
      isUp = await isPortActive(5000);
      if (isUp) break;
    }

    return NextResponse.json({
      success: true,
      started: true,
      isOnline: isUp,
      message: isUp
        ? "AI Vision Orchestrator launched successfully on port 5000!"
        : "Engine starting in background (binding hardware cameras)...",
      port: 5000,
      urls: {
        cctv1: "http://localhost:5000/video/cctv1",
        cctv2: "http://localhost:5000/video/cctv2",
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[API /start-stream error]:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
