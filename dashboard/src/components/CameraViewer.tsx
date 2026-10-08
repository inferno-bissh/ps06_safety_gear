"use client";

import React, { useState, useMemo } from "react";
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
} from "lucide-react";

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
  const { updateCameraName } = useSafety();
  const [showOverlay, setShowOverlay] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(camera.name);
  const [isSaving, setIsSaving] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [showFallbackSim, setShowFallbackSim] = useState(false);
  const [streamKey, setStreamKey] = useState(0);

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
    let target = camera.stream_url;
    // If stream_url is unset or still pointing to legacy static Unsplash placeholders, use the live Python stream!
    if (!target || target.includes("unsplash.com")) {
      target = defaultStreamEndpoint;
    }
    if (typeof window !== "undefined" && target.includes("localhost:5000")) {
      const hostname = window.location.hostname || "localhost";
      return target.replace("localhost", hostname);
    }
    return target;
  }, [camera.stream_url, camera.camera_id, showFallbackSim, defaultStreamEndpoint]);

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
        (targetId === "CCTV_01" || targetId.includes("GATE")) &&
        (wCam === "CAM_00" || wCam === "GATE" || wCam.includes("CCTV_01") || wCam.includes("CCTV1") || wCam === "CAM_00_GATE")
      ) return true;
      if (
        (targetId === "CCTV_02" || targetId.includes("WARD") || targetId.includes("FRONT")) &&
        (wCam === "CAM_01" || wCam === "WARD" || wCam === "FRONT" || wCam.includes("CCTV_02") || wCam.includes("CCTV2") || wCam === "CAM_01_WARD")
      ) return true;
      if (
        (targetId === "CCTV_03" || targetId.includes("LEFT")) &&
        (wCam === "CAM_02" || wCam.includes("CCTV_03") || wCam.includes("CCTV3"))
      ) return true;
      if (
        (targetId === "CCTV_04" || targetId.includes("RIGHT")) &&
        (wCam === "CAM_03" || wCam.includes("CCTV_04") || wCam.includes("CCTV4"))
      ) return true;
      return false;
    });
  }, [workers, camera.camera_id]);
  const isOffline = camera.status === "OFFLINE";

  return (
    <div
      className={cn(
        "rounded-lg overflow-hidden border border-[#26303C] bg-[#0E131A] font-mono flex flex-col shadow-lg transition-all",
        hasFireHazard && "border-red-600 ring-2 ring-red-500/40",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Stream Header */}
      <div className="bg-[#161F2B] px-3 py-2 border-b border-[#26303C] flex items-center justify-between text-xs">
        {isEditingName ? (
          <div className="flex items-center gap-1.5 flex-1 max-w-sm">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="bg-slate-900 border border-blue-500 text-slate-100 text-xs px-2 py-0.5 rounded outline-none w-full"
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
              className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
              title="Save Camera Name"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setEditedName(camera.name);
                setIsEditingName(false);
              }}
              className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
              title="Cancel"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-bold text-slate-100">{camera.name}</span>
            {camera.role && (
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">
                {camera.role}
              </span>
            )}
            <button
              onClick={() => {
                setEditedName(camera.name);
                setIsEditingName(true);
              }}
              className="p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Admin: Rename Camera"
            >
              <Pencil className="w-3 h-3" />
            </button>
            {onConnectIp && (
              <button
                onClick={() => onConnectIp(camera)}
                className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 border border-blue-500/40 rounded transition-colors"
                title="Connect Phone / IP Camera (+)"
              >
                <Plus className="w-3 h-3 text-blue-400 stroke-[2.5]" />
                <span className="text-[10px] font-bold">IP</span>
              </button>
            )}
            <span className="text-slate-400 text-[11px] font-mono-tabular">({camera.camera_id})</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOverlay(!showOverlay)}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] border flex items-center gap-1 transition-colors",
              showOverlay
                ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                : "bg-slate-800 text-slate-400 border-slate-700"
            )}
            title="Toggle YOLOv8 AI inference bounding boxes"
          >
            <Layers className="w-3 h-3" />
            <span>AI Overlay {showOverlay ? "ON" : "OFF"}</span>
          </button>

          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono-tabular">
            {camera.fps} FPS · {camera.resolution}
          </span>
        </div>
      </div>

      {/* Video Canvas Container */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
        {isOffline ? (
          <div className="text-center p-6 space-y-2">
            <WifiOff className="w-10 h-10 text-slate-600 mx-auto animate-pulse" />
            <div className="text-sm font-bold text-slate-400">CAMERA STREAM OFFLINE</div>
            <p className="text-xs text-slate-500">Attempting automatic cloud reconnection...</p>
          </div>
        ) : (
          <>
            {/* Background Stream Feed Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${resolvedStreamUrl}-${streamKey}`}
              src={resolvedStreamUrl}
              alt={camera.name}
              className="w-full h-full object-cover select-none"
              onLoad={() => setStreamError(false)}
              onError={() => {
                if (!showFallbackSim) {
                  setStreamError(true);
                }
              }}
            />

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
                      {/* Worker Tracker Header Tag */}
                      <div
                        className={cn(
                          "absolute -top-6 left-0 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap flex items-center gap-1",
                          isViolation ? "bg-amber-500 text-slate-950" : "bg-blue-600 text-white"
                        )}
                      >
                        <HardHat className="w-3 h-3" />
                        <span>{worker.worker_track_id} ({((worker.confidence ?? 0.88) * 100).toFixed(0)}%)</span>
                      </div>

                      {/* PPE Inspection Tag at bottom */}
                      <div className="absolute -bottom-6 left-0 flex gap-1">
                        <span
                          className={cn(
                            "text-[9px] px-1 py-0.2 rounded font-bold uppercase",
                            worker.ppe.helmet === "PASS"
                              ? "bg-emerald-600 text-white"
                              : worker.ppe.helmet === "FAIL"
                              ? "bg-red-600 text-white"
                              : "bg-purple-800 text-purple-200"
                          )}
                        >
                          H: {worker.ppe.helmet}
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
                <div className="flex items-center gap-2 pt-1 flex-wrap justify-center">
                  {onConnectIp && (
                    <button
                      onClick={() => onConnectIp(camera)}
                      className="px-2.5 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium transition-colors flex items-center gap-1 shadow-sm shadow-emerald-500/20"
                    >
                      <Plus className="w-3 h-3 stroke-[2.5]" /> Connect IP Stream
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setStreamError(false);
                      setStreamKey((k) => k + 1);
                    }}
                    className="px-2.5 py-1 text-[11px] bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry Stream
                  </button>
                  <button
                    onClick={() => setShowFallbackSim(true)}
                    className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors border border-slate-700"
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
          <div className="text-[11px] text-slate-500 py-1">No personnel detected in camera frame.</div>
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
