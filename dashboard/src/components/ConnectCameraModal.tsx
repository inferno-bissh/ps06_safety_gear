"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Camera } from "@/types/safety";
import { useSafety } from "@/context/SafetyContext";
import {
  X,
  Wifi,
  Video,
  Check,
  AlertTriangle,
  Copy,
  CheckCheck,
  Sparkles,
  Smartphone,
  Laptop,
  Radio,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConnectCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCameraId?: string;
}

export const ConnectCameraModal: React.FC<ConnectCameraModalProps> = ({
  isOpen,
  onClose,
  initialCameraId = "CCTV_02",
}) => {
  const { cameras, updateCameraConfig } = useSafety();

  const [selectedCamId, setSelectedCamId] = useState<string>(initialCameraId);
  const [cameraName, setCameraName] = useState<string>("");
  const [ipInput, setIpInput] = useState<string>("192.168.1.5");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    formattedUrl?: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Sync selected camera slot when modal opens or initialCameraId changes
  useEffect(() => {
    if (isOpen && initialCameraId) {
      setSelectedCamId(initialCameraId);
    }
  }, [isOpen, initialCameraId]);

  // Sync selected camera info when camera slot changes
  useEffect(() => {
    const cam = cameras.find((c) => c.camera_id === selectedCamId);
    if (cam) {
      setCameraName(cam.name);
      // If stream_url contains an IP, extract it
      if (cam.stream_url && !cam.stream_url.includes("unsplash.com")) {
        setIpInput(cam.stream_url);
      } else if (selectedCamId === "CCTV_01") {
        setIpInput("0");
      } else {
        setIpInput("192.168.1.5");
      }
    }
    setTestResult(null);
  }, [selectedCamId, cameras]);

  // Compute normalized stream URL
  const normalizedStreamUrl = useMemo(() => {
    let raw = ipInput.trim();
    if (!raw) return "";
    if (raw === "0" || raw === "1" || raw === "2") return raw;
    if (!raw.startsWith("http://") && !raw.startsWith("https://") && !raw.startsWith("rtsp://")) {
      if (!raw.includes(":")) {
        raw = `http://${raw}:8080/video`;
      } else if (!raw.includes("/")) {
        raw = `http://${raw}/video`;
      } else {
        raw = `http://${raw}`;
      }
    }
    // If it's an IP Webcam address on port 8080 or 4747 without an endpoint, automatically append /video
    if (raw.startsWith("http://") && (raw.endsWith(":8080") || raw.endsWith(":8080/"))) {
      raw = raw.replace(/\/+$/, "") + "/video";
    } else if (raw.startsWith("http://") && (raw.endsWith(":4747") || raw.endsWith(":4747/"))) {
      raw = raw.replace(/\/+$/, "") + "/video";
    }
    return raw;
  }, [ipInput]);

  // Generate python orchestrator launch command
  const generatedCommand = useMemo(() => {
    const c1 = cameras.find((c) => c.camera_id === "CCTV_01");
    const c2 = cameras.find((c) => c.camera_id === "CCTV_02");
    const c3 = cameras.find((c) => c.camera_id === "CCTV_03");
    const c4 = cameras.find((c) => c.camera_id === "CCTV_04");

    const c1Url = selectedCamId === "CCTV_01" ? normalizedStreamUrl : (c1?.stream_url || "");
    const c2Url = selectedCamId === "CCTV_02" ? normalizedStreamUrl : (c2?.stream_url || "");
    const c3Url = selectedCamId === "CCTV_03" ? normalizedStreamUrl : (c3?.stream_url || "");
    const c4Url = selectedCamId === "CCTV_04" ? normalizedStreamUrl : (c4?.stream_url || "");

    let cmd = `python vision_pipeline/multicam_orchestrator.py --cctv1-gate ${c1Url && !c1Url.includes(":5000") ? c1Url : "0"} --cctv2-front ${c2Url && !c2Url.includes(":5000") ? `"${c2Url}"` : `"http://192.168.1.5:8080/video"`}`;
    if (c3Url && !c3Url.includes(":5000")) cmd += ` --cctv3-side-left "${c3Url}"`;
    if (c4Url && !c4Url.includes(":5000")) cmd += ` --cctv4-side-right "${c4Url}"`;
    return cmd;
  }, [selectedCamId, normalizedStreamUrl, cameras]);

  const handleTestConnection = async () => {
    if (!ipInput.trim()) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      if (ipInput.trim() === "0" || ipInput.trim() === "1") {
        // Physical webcam index
        setTestResult({
          success: true,
          message: "Local integrated webcam selected (Index: " + ipInput.trim() + ")",
          formattedUrl: ipInput.trim(),
        });
        return;
      }

      const res = await fetch("/api/cameras/test-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: ipInput.trim(), url: normalizedStreamUrl }),
      });
      const data = await res.json();

      if (data.reachable) {
        setTestResult({
          success: true,
          message: `Stream reachable & responsive (${data.latencyMs}ms)`,
          latencyMs: data.latencyMs,
          formattedUrl: data.streamUrl,
        });
        if (data.streamUrl) setIpInput(data.streamUrl);
      } else {
        setTestResult({
          success: false,
          message: data.message || "Could not reach camera. Ensure phone IP Webcam is running.",
        });
      }
    } catch (e: unknown) {
      setTestResult({
        success: false,
        message: e instanceof Error ? e.message : "Network probe failed",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndConnect = async () => {
    setIsSaving(true);
    try {
      await updateCameraConfig(selectedCamId, {
        name: cameraName.trim(),
        stream_url: normalizedStreamUrl,
        status: "ONLINE",
      });

      const channelMap: Record<string, string> = {
        CCTV_01: "cctv1",
        CCTV_02: "cctv2",
        CCTV_03: "cctv3",
        CCTV_04: "cctv4",
      };
      const channel = channelMap[selectedCamId] || "cctv2";

      // Dynamically update the camera source via /api/cameras/config without dropping other feeds
      await fetch("/api/cameras/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          url: normalizedStreamUrl,
          action: "connect",
        }),
      }).catch((e) => console.warn("Could not dynamically update camera:", e));

      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(generatedCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0E131A] border border-[#26303C] rounded-xl w-full max-w-xl shadow-2xl font-mono overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#161F2B] px-5 py-3.5 border-b border-[#26303C] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Wifi className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>CONNECT IP CAMERA FEED</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 font-semibold">
                  AUTO-DETECT
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Link physical smartphone or RTSP feeds directly to the AI surveillance engine
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Channel Selector Pills */}
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Target Camera Slot:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {cameras.map((c) => (
                <button
                  key={c.camera_id}
                  onClick={() => setSelectedCamId(c.camera_id)}
                  className={cn(
                    "p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all min-h-[52px] active:scale-95",
                    selectedCamId === c.camera_id
                      ? "border-blue-500 bg-blue-600/20 text-white ring-2 ring-blue-500/50 shadow-sm"
                      : "border-slate-800 bg-[#121821] text-slate-400 hover:border-slate-700 hover:text-slate-300"
                  )}
                >
                  <span className="font-bold text-xs truncate">{c.camera_id}</span>
                  <span className="text-[11px] text-slate-400 truncate mt-0.5">
                    {c.role || c.name.split("—")[1] || "Camera"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Camera Name Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
              Camera Display Name:
            </label>
            <input
              type="text"
              value={cameraName}
              onChange={(e) => setCameraName(e.target.value)}
              className="w-full bg-[#161F2B] border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-slate-100 outline-none transition-colors"
              placeholder="e.g. CCTV 2 — Production Bay (Front Overhead View)"
            />
          </div>

          {/* Camera IP / URL Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Mobile Phone IP Address / Stream URL:
              </label>
              {normalizedStreamUrl && normalizedStreamUrl !== ipInput && (
                <span className="text-[10px] text-blue-400 font-mono">
                  ➔ {normalizedStreamUrl}
                </span>
              )}
            </div>
            <div className="flex gap-2.5">
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                className="flex-1 bg-[#161F2B] border border-slate-700 focus:border-blue-500 rounded-lg px-3.5 py-2.5 text-slate-100 font-mono outline-none transition-colors text-xs sm:text-sm"
                placeholder="192.168.1.5 or http://192.168.1.5:8080/video"
              />
              <button
                onClick={handleTestConnection}
                disabled={isTesting || !ipInput.trim()}
                className="h-11 px-5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-bold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap shadow-md shadow-blue-900/30 active:scale-95 text-xs sm:text-sm"
              >
                {isTesting ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <Radio className="w-4 h-4" />
                )}
                <span>Test Link</span>
              </button>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <span className="text-xs text-slate-400 font-semibold">Quick Presets:</span>
              <button
                onClick={() => setIpInput("192.168.1.5:8080")}
                className="text-xs bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors"
                title="Android IP Webcam default port"
              >
                <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                <span>IP Webcam (:8080)</span>
              </button>
              <button
                onClick={() => setIpInput("192.168.1.5:4747")}
                className="text-xs bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors"
                title="DroidCam default port"
              >
                <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                <span>DroidCam (:4747)</span>
              </button>
              <button
                onClick={() => setIpInput("0")}
                className="text-xs bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors"
              >
                <Laptop className="w-3.5 h-3.5 text-emerald-400" />
                <span>Laptop Webcam (0)</span>
              </button>
              <button
                onClick={() => setIpInput("1")}
                className="text-xs bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors"
              >
                <Laptop className="w-3.5 h-3.5 text-purple-400" />
                <span>USB Cam (1)</span>
              </button>
            </div>

            {/* Step-by-step phone connection guide */}
            <div className="mt-2.5 p-2.5 rounded bg-blue-950/20 border border-blue-500/20 text-[11px] text-slate-300 space-y-1">
              <div className="font-bold text-blue-400 flex items-center gap-1">
                <span>📱 Quick Phone Camera Setup:</span>
              </div>
              <p className="text-slate-400 text-[10px] leading-relaxed">
                1. Connect phone &amp; laptop to the <strong className="text-slate-200">same Wi-Fi or Mobile Hotspot</strong>.<br />
                2. On phone, open <strong className="text-slate-200">IP Webcam</strong> and tap <em className="text-emerald-400">&quot;Start server&quot;</em>.<br />
                3. Enter the exact IP from your phone screen (e.g. <code className="text-amber-300 bg-slate-900 px-1 rounded">192.168.x.x:8080</code>) above.<br />
                4. Click <strong className="text-blue-300">&quot;Test Link&quot;</strong> ➔ <strong className="text-emerald-400">&quot;Save &amp; Connect Camera&quot;</strong>.
              </p>
            </div>
          </div>

          {/* Test Link Result Banner */}
          {testResult && (
            <div
              className={cn(
                "p-3 rounded-lg border flex items-start gap-2 animate-in fade-in duration-150",
                testResult.success
                  ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                  : "bg-amber-950/20 border-amber-500/40 text-amber-300"
              )}
            >
              {testResult.success ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div className="font-bold text-[11px]">
                  {testResult.success ? "STREAM LINK VERIFIED" : "CONNECTION NOTICE"}
                </div>
                <div className="text-[11px] opacity-90">{testResult.message}</div>
              </div>
            </div>
          )}

          {/* Launch Command Helper Box */}
          <div className="bg-[#121821] border border-slate-800 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Vision Orchestrator Terminal Command:</span>
              </span>
              <button
                onClick={handleCopyCmd}
                className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold"
              >
                {copiedCmd ? (
                  <>
                    <CheckCheck className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <div className="bg-slate-950 p-2 rounded border border-slate-800/80 font-mono text-[10px] text-emerald-400 break-all select-all">
              {generatedCommand}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-[#121821] px-6 py-4 border-t border-[#26303C] flex items-center justify-between">
          <button
            onClick={onClose}
            className="h-11 px-5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors font-semibold text-xs sm:text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAndConnect}
            disabled={isSaving || !cameraName.trim() || !normalizedStreamUrl}
            className="h-11 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-extrabold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/50 active:scale-95 text-xs sm:text-sm"
          >
            {isSaving ? <span className="animate-spin">⏳</span> : <Check className="w-4 h-4 stroke-[2.5]" />}
            <span>Save &amp; Connect Camera</span>
          </button>
        </div>
      </div>
    </div>
  );
};
