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
    const raw = ipInput.trim();
    if (!raw) return "";
    if (raw === "0" || raw === "1" || raw === "2") return raw;
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("rtsp://")) {
      return raw;
    }
    if (!raw.includes(":")) {
      return `http://${raw}:8080/video`;
    }
    if (!raw.includes("/")) {
      return `http://${raw}/video`;
    }
    return `http://${raw}`;
  }, [ipInput]);

  // Generate python orchestrator launch command
  const generatedCommand = useMemo(() => {
    let cctv1 = "0";
    let cctv2 = `"http://192.168.1.5:8080/video"`;
    let cctv3 = "";

    cameras.forEach((c) => {
      const url = c.camera_id === selectedCamId ? normalizedStreamUrl : (c.stream_url || "");
      if (c.camera_id === "CCTV_01") cctv1 = url.includes("http") ? `"${url}"` : (url || "0");
      if (c.camera_id === "CCTV_02") cctv2 = url.includes("http") ? `"${url}"` : (url || `"http://192.168.1.5:8080/video"`);
      if (c.camera_id === "CCTV_03" && url && !url.includes("unsplash")) cctv3 = ` --cctv3-side-left "${url}"`;
    });

    if (selectedCamId === "CCTV_01") {
      cctv1 = normalizedStreamUrl.includes("http") ? `"${normalizedStreamUrl}"` : normalizedStreamUrl;
    } else if (selectedCamId === "CCTV_02") {
      cctv2 = normalizedStreamUrl.includes("http") ? `"${normalizedStreamUrl}"` : normalizedStreamUrl;
    }

    return `python vision_pipeline/multicam_orchestrator.py --cctv1-gate ${cctv1} --cctv2-front ${cctv2}${cctv3}`;
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

      // Automatically launch / refresh the Python AI Vision Orchestrator on port 5000
      let cctv1 = "0";
      let cctv2 = "http://192.168.1.5:8080/video";
      cameras.forEach((c) => {
        const u = c.camera_id === selectedCamId ? normalizedStreamUrl : (c.stream_url || "");
        if (c.camera_id === "CCTV_01") cctv1 = u.includes("http") ? u : (u || "0");
        if (c.camera_id === "CCTV_02") cctv2 = u.includes("http") ? u : (u || "http://192.168.1.5:8080/video");
      });
      if (selectedCamId === "CCTV_01") cctv1 = normalizedStreamUrl || "0";
      if (selectedCamId === "CCTV_02") cctv2 = normalizedStreamUrl || "http://192.168.1.5:8080/video";

      await fetch("/api/cameras/start-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cctv1, cctv2, forceRestart: true }),
      }).catch((e) => console.warn("Could not auto-start python stream:", e));

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {cameras.map((c) => (
                <button
                  key={c.camera_id}
                  onClick={() => setSelectedCamId(c.camera_id)}
                  className={cn(
                    "p-2 rounded-lg border text-left flex flex-col transition-all",
                    selectedCamId === c.camera_id
                      ? "border-blue-500 bg-blue-600/15 text-white ring-1 ring-blue-500/50"
                      : "border-slate-800 bg-[#121821] text-slate-400 hover:border-slate-700"
                  )}
                >
                  <span className="font-bold text-xs truncate">{c.camera_id}</span>
                  <span className="text-[10px] text-slate-400 truncate mt-0.5">
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
            <div className="flex gap-2">
              <input
                type="text"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                className="flex-1 bg-[#161F2B] border border-slate-700 focus:border-blue-500 rounded-lg px-3 py-2 text-slate-100 font-mono outline-none transition-colors"
                placeholder="192.168.1.5 or http://192.168.1.5:8080/video"
              />
              <button
                onClick={handleTestConnection}
                disabled={isTesting || !ipInput.trim()}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                {isTesting ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <Radio className="w-3.5 h-3.5" />
                )}
                <span>Test Link</span>
              </button>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-500">Quick Presets:</span>
              <button
                onClick={() => setIpInput("192.168.1.5")}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2 py-0.5 rounded flex items-center gap-1"
              >
                <Smartphone className="w-2.5 h-2.5 text-blue-400" />
                <span>Phone: 192.168.1.5</span>
              </button>
              <button
                onClick={() => setIpInput("0")}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2 py-0.5 rounded flex items-center gap-1"
              >
                <Laptop className="w-2.5 h-2.5 text-emerald-400" />
                <span>Laptop Webcam (0)</span>
              </button>
              <button
                onClick={() => setIpInput("http://localhost:5000/video/cctv2")}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2 py-0.5 rounded flex items-center gap-1"
              >
                <Video className="w-2.5 h-2.5 text-purple-400" />
                <span>Local Stream (5000)</span>
              </button>
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
        <div className="bg-[#121821] px-5 py-3 border-t border-[#26303C] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAndConnect}
            disabled={isSaving || !cameraName.trim() || !normalizedStreamUrl}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-950/40"
          >
            {isSaving ? <span className="animate-spin">⏳</span> : <Check className="w-4 h-4" />}
            <span>Save & Connect Camera</span>
          </button>
        </div>
      </div>
    </div>
  );
};
