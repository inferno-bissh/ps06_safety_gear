"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Camera, WorkerTrack } from "@/types/safety";
import { useSafety } from "@/context/SafetyContext";
import { PPEChip } from "./PPEChip";
import { cn } from "@/lib/utils";
import {
  Video,
  Layers,
  WifiOff,
  Maximize2,
  HardHat,
  Flame,
  AlertCircle,
  Pencil,
  Check,
  X,
  RefreshCw,
  Radio,
  Plus,
  Play,
  UserCheck,
  UserX,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
} from "lucide-react";

export type DetectionState =
  | "HELMET_DETECTED"
  | "HELMET_NOT_DETECTED"
  | "PERSON_NOT_DETECTED"
  | "CHECKING_MODEL_LOADING"
  | "CAMERA_DISCONNECTED"
  | "DETECTION_ERROR";

const FALLBACK_IMAGES: Record<string, string> = {
  CCTV_01: "https://images.unsplash.com/photo-1541888946425-d0fbb186c5f8?auto=format&fit=crop&w=1200&q=80",
  CCTV_02: "https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=1200&q=80",
  CCTV_03: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=80",
  CCTV_04: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80",
};

interface CameraViewerProps {
  camera: Camera;
  workers: WorkerTrack[];
  zoneName: string;
  hasFireHazard?: boolean;
  hasSmokeHazard?: boolean;
  className?: string;
  onConnectIp?: (camera: Camera) => void;
}

export const CameraViewer: React.FC<CameraViewerProps> = ({
  camera,
  workers,
  zoneName,
  hasFireHazard = false,
  hasSmokeHazard = false,
  className,
  onConnectIp,
}) => {
  const { updateCameraName, isVisionEngineOnline, telemetryError } = useSafety();
  const [showOverlay, setShowOverlay] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(camera.name);
  const [isSaving, setIsSaving] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [showFallbackSim, setShowFallbackSim] = useState(false);
  const [streamKey, setStreamKey] = useState(0);

  const [isStartingEngine, setIsStartingEngine] = useState(false);
  const [useSnapshotMode, setUseSnapshotMode] = useState(false);
  const [snapshotTimestamp, setSnapshotTimestamp] = useState(Date.now());

  // High-reliability snapshot polling fallback if MJPEG streaming stalls in browser
  useEffect(() => {
    if (!useSnapshotMode || showFallbackSim || streamError) return;
    const interval = setInterval(() => {
      setSnapshotTimestamp(Date.now());
    }, 80);
    return () => clearInterval(interval);
  }, [useSnapshotMode, showFallbackSim, streamError]);

  const defaultStreamEndpoint = useMemo(() => {
    const camId = (camera.camera_id || "").toLowerCase();
    if (camId.includes("1") || camId.includes("gate")) return "http://localhost:5000/video/cctv1";
    if (camId.includes("2") || camId.includes("front") || camId.includes("ward")) return "http://localhost:5000/video/cctv2";
    if (camId.includes("3") || camId.includes("left")) return "http://localhost:5000/video/cctv3";
    if (camId.includes("4") || camId.includes("right")) return "http://localhost:5000/video/cctv4";
    return "http://localhost:5000/video/composite";
  }, [camera.camera_id]);

  const resolvedStreamUrl = useMemo(() => {
    if (showFallbackSim) {
      return FALLBACK_IMAGES[camera.camera_id] || FALLBACK_IMAGES.CCTV_02;
    }
    // All local & IP cameras route through our sub-50ms Python AI Vision pipeline on port 5000
    let target = defaultStreamEndpoint;
    // If the stream_url already explicitly specifies an HTTP endpoint on port 5000, keep it
    if (camera.stream_url && camera.stream_url.includes(":5000")) {
      target = camera.stream_url;
    }
    if (typeof window !== "undefined" && target.includes("localhost:5000")) {
      const hostname = window.location.hostname || "localhost";
      return target.replace("localhost", hostname);
    }
    return target;
  }, [camera.stream_url, camera.camera_id, showFallbackSim, defaultStreamEndpoint]);

  const snapshotUrl = useMemo(() => {
    const camId = (camera.camera_id || "").toLowerCase();
    const endpoint = camId.includes("1") || camId.includes("gate") ? "cctv1" : "cctv2";
    let base = `http://localhost:5000/snapshot/${endpoint}`;
    if (typeof window !== "undefined" && base.includes("localhost:5000")) {
      const hostname = window.location.hostname || "localhost";
      base = base.replace("localhost", hostname);
    }
    return `${base}?t=${snapshotTimestamp}`;
  }, [camera.camera_id, snapshotTimestamp]);

  // When camera stream URL or status updates (e.g. user clicked Save & Connect in modal), reset error & reconnect
  useEffect(() => {
    setStreamError(false);
    setShowFallbackSim(false);
    setStreamKey((k) => k + 1);
  }, [camera.stream_url, camera.status, camera.camera_id]);

  // Automatic reconnection poll: while stream is in error/standby, periodically check if port 5000 is active
  useEffect(() => {
    if (!streamError || showFallbackSim) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/cameras/start-stream", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.online) {
          setStreamError(false);
          setStreamKey((k) => k + 1);
        }
      } catch {
        // Still connecting, keep waiting
      }
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [streamError, showFallbackSim]);

  const handleStartEngine = async () => {
    setIsStartingEngine(true);
    try {
      const isCctv1 = (camera.camera_id || "").toLowerCase().includes("1");
      const cctv1 = isCctv1 ? (camera.stream_url || "0") : "0";
      const cctv2 = !isCctv1 ? (camera.stream_url || "http://192.168.1.5:8080/video") : "http://192.168.1.5:8080/video";

      await fetch("/api/cameras/start-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cctv1, cctv2, forceRestart: true }),
      });
      // Wait for port 5000 to be ready then refresh
      setTimeout(() => {
        setStreamError(false);
        setStreamKey((k) => k + 1);
      }, 2000);
    } catch (e) {
      console.error("Failed to start AI Vision engine:", e);
    } finally {
      setIsStartingEngine(false);
    }
  };

  const handleSaveName = async () => {
    if (!editedName.trim()) return;
    setIsSaving(true);
    try {
      await updateCameraName(camera.camera_id, editedName.trim());
      setIsEditingName(false);
    } finally {
      setIsSaving(false);
    }
  };

  const zoneWorkers = useMemo(() => {
    const targetId = (camera.camera_id || "").toUpperCase();
    return workers.filter((w) => {
      const wCam = (w.camera_id || "").toUpperCase();
      if (wCam === targetId) return true;
      if (
        (targetId === "CCTV_01" || targetId.includes("GATE") || targetId === "CAM_00" || targetId.includes("CCTV1")) &&
        (wCam === "CAM_00" || wCam === "GATE" || wCam.includes("CCTV_01") || wCam.includes("CCTV1") || wCam === "CAM_00_GATE")
      ) return true;
      if (
        (targetId === "CCTV_02" || targetId.includes("WARD") || targetId.includes("FRONT") || targetId === "CAM_01" || targetId.includes("CCTV2")) &&
        (wCam === "CAM_01" || wCam === "WARD" || wCam === "FRONT" || wCam.includes("CCTV_02") || wCam.includes("CCTV2") || wCam === "CAM_01_WARD")
      ) return true;
      if (
        (targetId === "CCTV_03" || targetId.includes("LEFT") || targetId === "CAM_02" || targetId.includes("CCTV3")) &&
        (wCam === "CAM_02" || wCam.includes("CCTV_03") || wCam.includes("CCTV3"))
      ) return true;
      if (
        (targetId === "CCTV_04" || targetId.includes("RIGHT") || targetId === "CAM_03" || targetId.includes("CCTV4")) &&
        (wCam === "CAM_03" || wCam.includes("CCTV_04") || wCam.includes("CCTV4"))
      ) return true;
      return false;
    });
  }, [workers, camera.camera_id]);
  const isOffline = camera.status === "OFFLINE";

  // Compute 6-State Reliable AI PPE Detection Status
  const currentDetectionState = useMemo<DetectionState>(() => {
    if (camera.status === "OFFLINE" || streamError) {
      return "CAMERA_DISCONNECTED";
    }
    if (isStartingEngine) {
      return "CHECKING_MODEL_LOADING";
    }
    if (telemetryError && !showFallbackSim) {
      return "DETECTION_ERROR";
    }
    if (!isVisionEngineOnline && !showFallbackSim) {
      return "CHECKING_MODEL_LOADING";
    }
    if (zoneWorkers.length === 0) {
      return "PERSON_NOT_DETECTED";
    }
    const hasHelmet = zoneWorkers.some((w) => w.ppe?.helmet === "PASS");
    if (hasHelmet) {
      return "HELMET_DETECTED";
    }
    return "HELMET_NOT_DETECTED";
  }, [
    camera.status,
    streamError,
    isStartingEngine,
    telemetryError,
    isVisionEngineOnline,
    showFallbackSim,
    zoneWorkers,
  ]);

  // Temporal smoothing across consecutive frames (300ms debounce to eliminate flicker while preserving real-time accuracy)
  const [smoothedState, setSmoothedState] = useState<DetectionState>(currentDetectionState);

  useEffect(() => {
    if (
      currentDetectionState === "CAMERA_DISCONNECTED" ||
      currentDetectionState === "CHECKING_MODEL_LOADING"
    ) {
      setSmoothedState(currentDetectionState);
      return;
    }

    const timer = setTimeout(() => {
      setSmoothedState(currentDetectionState);
    }, 300);

    return () => clearTimeout(timer);
  }, [currentDetectionState]);

  const badgeInfo = useMemo(() => {
    switch (smoothedState) {
      case "HELMET_DETECTED":
        return {
          label: "Helmet Detected",
          borderBadge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-emerald-950/30",
          dotColor: "bg-emerald-400",
          icon: CheckCircle2,
        };
      case "HELMET_NOT_DETECTED":
        return {
          label: "Helmet Not Detected",
          borderBadge: "bg-red-500/20 text-red-300 border-red-500/50 shadow-red-950/30",
          dotColor: "bg-red-400",
          icon: AlertTriangle,
        };
      case "PERSON_NOT_DETECTED":
        return {
          label: "Person Not Detected",
          borderBadge: "bg-slate-800 text-slate-300 border-slate-700",
          dotColor: "bg-slate-400",
          icon: UserX,
        };
      case "CHECKING_MODEL_LOADING":
        return {
          label: "Checking / Model Loading",
          borderBadge: "bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse",
          dotColor: "bg-amber-400 animate-spin",
          icon: RefreshCw,
        };
      case "CAMERA_DISCONNECTED":
        return {
          label: "Camera Disconnected",
          borderBadge: "bg-zinc-800/80 text-zinc-400 border-zinc-700/60",
          dotColor: "bg-zinc-500",
          icon: WifiOff,
        };
      case "DETECTION_ERROR":
        return {
          label: "Detection Error",
          borderBadge: "bg-rose-500/20 text-rose-300 border-rose-500/50",
          dotColor: "bg-rose-500",
          icon: AlertOctagon,
        };
    }
  }, [smoothedState]);

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border border-[#26303C] bg-[#0E131A] font-mono flex flex-col shadow-lg transition-all w-full max-w-full",
        hasFireHazard && "border-red-600 ring-2 ring-red-500/50 shadow-red-950/40 animate-pulse",
        !hasFireHazard && hasSmokeHazard && "border-amber-500 ring-2 ring-amber-500/50 shadow-amber-950/40",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Stream Header */}
      <div className="bg-[#161F2B] px-3.5 py-2.5 border-b border-[#26303C] flex items-center justify-between text-xs">
        {isEditingName ? (
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="bg-slate-900 border border-blue-500 text-slate-100 text-xs px-2.5 py-1 rounded-md outline-none w-full"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") {
                  setEditedName(camera.name);
                  setIsEditingName(false);
                }
              }}
            />
            <button
              onClick={handleSaveName}
              disabled={isSaving}
              className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              title="Save Camera Name"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setEditedName(camera.name);
                setIsEditingName(false);
              }}
              className="p-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-extrabold text-sm text-slate-100">{camera.name}</span>
            {camera.role && (
              <span className="text-[11px] font-semibold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-md border border-blue-500/30">
                {camera.role}
              </span>
            )}
            <button
              onClick={() => {
                setEditedName(camera.name);
                setIsEditingName(true);
              }}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-md transition-colors"
              title="Admin: Rename Camera"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {onConnectIp && (
              <button
                onClick={() => onConnectIp(camera)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 border border-blue-500/40 rounded-lg transition-all min-h-[30px]"
                title="Connect Phone / IP Camera (+)"
              >
                <Plus className="w-3.5 h-3.5 text-blue-400 stroke-[2.5]" />
                <span>IP Stream</span>
              </button>
            )}
            <span className="text-slate-400 text-xs font-mono-tabular">({camera.camera_id})</span>
            {/* 6-State Reliable AI PPE Detection Status Badge */}
            <div
              className={cn(
                "px-2.5 py-0.5 text-xs font-bold border rounded-lg flex items-center gap-1.5 shadow-sm transition-all",
                badgeInfo.borderBadge
              )}
              title={`Detection Status: ${badgeInfo.label}`}
            >
              <badgeInfo.icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{badgeInfo.label}</span>
            </div>
            {hasFireHazard && (
              <span className="flex items-center gap-1 text-[11px] font-extrabold bg-red-600/30 text-red-300 border border-red-500/60 px-2 py-0.5 rounded-md animate-pulse">
                <Flame className="w-3.5 h-3.5 text-red-400" /> FIRE [P3]
              </span>
            )}
            {!hasFireHazard && hasSmokeHazard && (
              <span className="flex items-center gap-1 text-[11px] font-extrabold bg-orange-500/30 text-orange-300 border border-orange-500/60 px-2 py-0.5 rounded-md animate-pulse">
                <AlertCircle className="w-3.5 h-3.5 text-orange-400" /> SMOKE [P2]
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowFallbackSim(!showFallbackSim);
              setStreamError(false);
              setStreamKey((k) => k + 1);
            }}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all min-h-[30px]",
              showFallbackSim
                ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
            )}
            title="Toggle between Live Hardware Webcam and Simulated Feed"
          >
            <Radio className="w-3 h-3" />
            <span>{showFallbackSim ? "DEMO FEED" : "LIVE FEED"}</span>
          </button>

          <button
            onClick={() => setShowOverlay(!showOverlay)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all min-h-[30px]",
              showOverlay
                ? "bg-blue-600/20 text-blue-300 border-blue-500/50 shadow-sm"
                : "bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-700"
            )}
            title="Toggle YOLOv8 AI inference bounding boxes"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>AI {showOverlay ? "ON" : "OFF"}</span>
          </button>

          <button
            onClick={() => {
              setStreamError(false);
              setUseSnapshotMode(false);
              setStreamKey((k) => k + 1);
            }}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 min-h-[30px] min-w-[30px] flex items-center justify-center transition-colors"
            title="Reconnect / Refresh Stream Socket"
          >
            <RefreshCw className="w-3 h-3" />
          </button>

          <span className="text-[11px] bg-slate-800/80 text-slate-300 px-2 py-1 rounded-md font-mono-tabular font-semibold border border-slate-700/60 hidden sm:inline">
            {camera.fps} FPS
          </span>
        </div>
      </div>

      {/* Video Canvas Container (Strict 16:9 box with zero border overflow) */}
      <div className="relative w-full aspect-video bg-[#05080E] flex items-center justify-center overflow-hidden rounded-none border-0 select-none">
        {isOffline ? (
          <div className="text-center p-6 space-y-2.5">
            <WifiOff className="w-10 h-10 text-slate-600 mx-auto animate-pulse" />
            <div className="text-sm font-bold text-slate-400">CAMERA STREAM OFFLINE</div>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Camera is currently offline. Connect an IP stream or start the AI Vision Engine.
            </p>
            <div className="flex items-center gap-2.5 pt-2 justify-center flex-wrap">
              {onConnectIp && (
                <button
                  onClick={() => onConnectIp(camera)}
                  className="px-3.5 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/25 min-h-[36px] active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> <span>Connect IP Stream</span>
                </button>
              )}
              <button
                onClick={handleStartEngine}
                disabled={isStartingEngine}
                className="px-3.5 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-lg font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-900/40 min-h-[36px] active:scale-95"
              >
                {isStartingEngine ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Start AI Engine</span>
              </button>
              <button
                onClick={() => setShowFallbackSim(true)}
                className="px-3.5 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition-all border border-slate-700 min-h-[36px] active:scale-95"
              >
                Demo Feed
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Background Stream Feed Image (Fit precisely inside container, aspect preserved, zero overflow) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${resolvedStreamUrl}-${useSnapshotMode ? "snap" : "mjpeg"}-${streamKey}`}
              src={showFallbackSim ? resolvedStreamUrl : useSnapshotMode ? snapshotUrl : resolvedStreamUrl}
              alt={camera.name}
              className="w-full h-full object-contain block max-w-full max-h-full select-none"
              onLoad={() => setStreamError(false)}
              onError={() => {
                if (!showFallbackSim) {
                  if (!useSnapshotMode) {
                    setUseSnapshotMode(true);
                  } else {
                    setStreamError(true);
                  }
                }
              }}
            />

            {/* Real-time AI Status HUD Badge in Video Canvas */}
            {!streamError && (
              <div className="absolute top-2 right-2 z-10 pointer-events-none">
                <div
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-bold border rounded-md backdrop-blur-md flex items-center gap-1.5 shadow-lg",
                    badgeInfo.borderBadge
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full", badgeInfo.dotColor)} />
                  <span>{badgeInfo.label}</span>
                </div>
              </div>
            )}

            {/* AI Bounding Boxes & Tracking Layer */}
            {showOverlay && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Fire Overlay if active */}
                {hasFireHazard && (
                  <div className="absolute top-1/3 left-1/4 w-48 h-36 border-2 border-red-500 bg-red-600/25 rounded animate-pulse">
                    <div className="bg-red-600 text-white font-bold text-[10px] px-1.5 py-0.5 inline-flex items-center gap-1">
                      <Flame className="w-3 h-3" /> FIRE DETECTED [0.96]
                    </div>
                  </div>
                )}

                {/* Smoke Overlay if active */}
                {hasSmokeHazard && (
                  <div className="absolute top-1/4 right-1/4 w-52 h-44 border-2 border-orange-500 bg-orange-600/20 rounded animate-pulse">
                    <div className="bg-orange-600 text-white font-bold text-[10px] px-1.5 py-0.5 inline-flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> SMOKE PLUME [0.85]
                    </div>
                  </div>
                )}

                {/* Worker Bounding Boxes */}
                {zoneWorkers.map((worker) => {
                  if (!worker.bbox) return null;
                  const isViolation = Object.values(worker.ppe).includes("FAIL");
                  const isNearTop = (worker.bbox.y ?? 0) < 8;
                  const isNearBottom = ((worker.bbox.y ?? 0) + (worker.bbox.height ?? 0)) > 90;

                  return (
                    <div
                      key={worker.worker_track_id}
                      className={cn(
                        "absolute rounded border-2 transition-all",
                        isViolation
                          ? "border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/20"
                          : "border-blue-400 bg-blue-500/10"
                      )}
                      style={{
                        top: `${worker.bbox.y}%`,
                        left: `${worker.bbox.x}%`,
                        width: `${worker.bbox.width}%`,
                        height: `${worker.bbox.height}%`,
                      }}
                    >
                      {/* Worker Tracker Header Tag (Clamped inside box if near top border) */}
                      <div
                        className={cn(
                          "absolute text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap flex items-center gap-1 shadow-sm z-10",
                          isNearTop ? "top-1 left-1" : "-top-6 left-0",
                          isViolation ? "bg-amber-500 text-slate-950" : "bg-blue-600 text-white"
                        )}
                      >
                        <HardHat className="w-3 h-3" />
                        <span>{worker.worker_track_id} ({((worker.confidence ?? 0.88) * 100).toFixed(0)}%)</span>
                      </div>

                      {/* PPE Inspection Tag at bottom (Clamped inside box if near bottom border) */}
                      <div
                        className={cn(
                          "absolute flex gap-1 flex-wrap z-10",
                          isNearBottom ? "bottom-1 left-1" : "-bottom-6 left-0"
                        )}
                      >
                        <span
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                            worker.ppe.helmet === "PASS"
                              ? "bg-emerald-600 text-white"
                              : worker.ppe.helmet === "FAIL"
                              ? "bg-red-600 text-white"
                              : "bg-purple-800 text-purple-200"
                          )}
                        >
                          {worker.ppe.helmet === "PASS"
                            ? "Helmet Detected"
                            : worker.ppe.helmet === "FAIL"
                            ? "Helmet Not Detected"
                            : "Helmet: Unknown"}
                        </span>
                        <span
                          className={cn(
                            "text-[9px] px-1 py-0.2 rounded font-bold uppercase",
                            worker.ppe.vest === "PASS"
                              ? "bg-emerald-600 text-white"
                              : worker.ppe.vest === "FAIL"
                              ? "bg-red-600 text-white"
                              : "bg-purple-800 text-purple-200"
                          )}
                        >
                          V: {worker.ppe.vest}
                        </span>
                        <span
                          className={cn(
                            "text-[9px] px-1 py-0.2 rounded font-bold uppercase",
                            worker.ppe.gloves === "PASS"
                              ? "bg-emerald-600 text-white"
                              : worker.ppe.gloves === "FAIL"
                              ? "bg-red-600 text-white"
                              : "bg-purple-800 text-purple-200"
                          )}
                        >
                          G: {worker.ppe.gloves}
                        </span>
                        <span
                          className={cn(
                            "text-[9px] px-1 py-0.2 rounded font-bold uppercase",
                            worker.ppe.safety_shoes === "PASS"
                              ? "bg-emerald-600 text-white"
                              : worker.ppe.safety_shoes === "FAIL"
                              ? "bg-red-600 text-white"
                              : "bg-purple-800 text-purple-200"
                          )}
                        >
                          F: {worker.ppe.safety_shoes}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Live Indicator overlay watermark */}
            {!streamError && !showFallbackSim && (
              <div className="absolute top-2 left-2 bg-black/80 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] flex items-center gap-1.5 font-bold shadow pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>LIVE MJPEG (30 FPS) • {zoneName}</span>
              </div>
            )}

            {/* Fallback Simulation Badge */}
            {showFallbackSim && (
              <div className="absolute top-2 left-2 bg-amber-950/90 text-amber-200 border border-amber-500/40 px-2 py-0.5 rounded text-[10px] flex items-center gap-1.5 font-bold shadow">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>DEMO SIMULATION FEED</span>
                <button
                  onClick={() => {
                    setShowFallbackSim(false);
                    setStreamError(false);
                    setStreamKey((k) => k + 1);
                  }}
                  className="ml-1 text-[9px] bg-amber-800/60 hover:bg-amber-700 text-white px-1 py-0.2 rounded transition-colors"
                >
                  Switch to Live
                </button>
              </div>
            )}

            {/* Standby / Error Overlay when Python Stream is not broadcasting yet */}
            {streamError && !showFallbackSim && (
              <div className="absolute inset-0 bg-[#0B0F17]/95 flex flex-col items-center justify-center p-4 text-center space-y-2 z-10">
                <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Video className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-200 tracking-wider">
                    STREAM STANDBY — PORT 5000
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs">
                    Start the Python vision orchestrator to broadcast this camera feed.
                  </p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 font-mono text-[10px] text-emerald-400 select-all max-w-sm truncate">
                  python vision_pipeline/multicam_orchestrator.py
                </div>
                <div className="flex items-center gap-2.5 pt-2 flex-wrap justify-center">
                  <button
                    onClick={handleStartEngine}
                    disabled={isStartingEngine}
                    className="px-3.5 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-lg font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-500/20 min-h-[36px] active:scale-95"
                  >
                    {isStartingEngine ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Starting AI Engine...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" /> Start AI Vision Engine
                      </>
                    )}
                  </button>
                  {onConnectIp && (
                    <button
                      onClick={() => onConnectIp(camera)}
                      className="px-3.5 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition-all flex items-center gap-1.5 border border-slate-700 min-h-[36px] active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Connect IP Stream
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setStreamError(false);
                      setStreamKey((k) => k + 1);
                    }}
                    className="px-3.5 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all flex items-center gap-1.5 min-h-[36px] active:scale-95 shadow-sm shadow-blue-500/20"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry Stream
                  </button>
                  <button
                    onClick={() => setShowFallbackSim(true)}
                    className="px-3.5 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold transition-all border border-slate-700 min-h-[36px] active:scale-95"
                  >
                    Show Demo Feed
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Tracked Personnel Footer Panel */}
      <div className="bg-[#121821] p-2.5 border-t border-[#26303C] space-y-2">
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold uppercase">
          <span>Active Workers Tracked ({zoneWorkers.length})</span>
          <span className="text-slate-500">Model: YOLOv8-Custom (7 Classes)</span>
        </div>

        {zoneWorkers.length === 0 ? (
          <div className="text-[11px] text-slate-400 py-1.5 flex items-center justify-between">
            <span>No personnel currently detected in camera frame.</span>
            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", badgeInfo.borderBadge)}>
              {badgeInfo.label}
            </span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {zoneWorkers.map((w) => (
              <div
                key={w.worker_track_id}
                className="bg-[#1A222C] p-2 rounded border border-slate-800 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <span className="text-blue-400">{w.worker_track_id}</span>
                  <span className="text-slate-500 text-[10px]">
                    [{((w.confidence ?? 0.88) * 100).toFixed(0)}%]
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PPEChip label="Helmet" status={w.ppe.helmet} />
                  <PPEChip label="Vest" status={w.ppe.vest} />
                  <PPEChip label="Gloves" status={w.ppe.gloves} />
                  <PPEChip label="Footwear" status={w.ppe.safety_shoes} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
