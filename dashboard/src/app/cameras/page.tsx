"use client";

import React, { useState } from "react";
import { useSafety } from "@/context/SafetyContext";
import { CameraViewer } from "@/components/CameraViewer";
import {
  Video,
  Cpu,
  Sparkles,
  Users,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  UserCheck,
  Building2,
  Workflow,
  CheckCircle2,
  Plus,
  Smartphone,
} from "lucide-react";
import { ConnectCameraModal } from "@/components/ConnectCameraModal";
import { PhoneCameraSettings } from "@/components/PhoneCameraSettings";

export default function CamerasPage() {
  const { cameras, zones, workerTracks, gateLogs, liveHazard } = useSafety();
  const [filterGatePpe, setFilterGatePpe] = useState<"ALL" | "COMPLIANT" | "NON_COMPLIANT">("ALL");
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [modalCameraId, setModalCameraId] = useState<string>("CCTV_02");
  const [showPhoneSettings, setShowPhoneSettings] = useState(false);

  const filteredLogs = gateLogs.filter((log) => {
    if (filterGatePpe === "ALL") return true;
    return log.ppe_status === filterGatePpe;
  });

  return (
    <div className="space-y-6 font-mono text-slate-200">
      {/* Title & Architecture Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#26303C] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-blue-500/10 border border-blue-500/30">
              <Video className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase">
                Dual-Zone Surveillance & Edge Inference
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Decoupled multi-phone CCTV ingestion • Gate choke-point audit • Event-driven cross-angle identity correlation
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowPhoneSettings(!showPhoneSettings)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold shadow-sm transition-all border min-h-[38px] cursor-pointer ${
              showPhoneSettings
                ? "bg-cyan-500/25 border-cyan-400 text-cyan-200"
                : "bg-[#161F2B] hover:bg-slate-800 text-cyan-300 border-[#26303C]"
            }`}
            title="Configure Phone Camera IP Address & Stream Settings"
          >
            <Smartphone className="w-4 h-4 text-cyan-400" />
            <span>Phone Camera Settings</span>
          </button>
          <button
            onClick={() => {
              setModalCameraId("CCTV_02");
              setIsConnectModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-500/25 transition-all border border-blue-400/40 min-h-[38px] active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Connect IP Camera</span>
          </button>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded text-xs">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400">Inference:</span>
            <span className="font-bold text-emerald-400">YOLOv8 + ByteTrack (CPU Optimized)</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded text-xs">
            <UserCheck className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-400">Biometrics:</span>
            <span className="font-bold text-cyan-400">YuNet + SFace (128-D)</span>
          </div>
        </div>
      </div>

      {/* Collapsible Phone Camera Settings Panel */}
      {showPhoneSettings && (
        <div className="animate-in fade-in duration-150">
          <PhoneCameraSettings />
        </div>
      )}

      {/* Dual-Zone System Flow Blueprint Banner */}
      <div className="bg-[#0f141c] border border-blue-500/20 rounded-xl p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-blue-500/5 to-transparent pointer-events-none" />
        <div className="flex items-center gap-2 mb-3">
          <Workflow className="w-4 h-4 text-blue-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-blue-300">
            End-to-End Edge Pipeline Architecture
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Step 1 */}
          <div className="bg-[#141b24] border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                  ZONE 1: CHOKE-POINT
                </span>
                <span className="text-slate-500 text-[10px]">Eye-Level Cam (CAM_00)</span>
              </div>
              <p className="font-bold text-slate-200 mb-1">Gate Entry & Facial Verification</p>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Captures worker frontal face, extracts 128-D embedding, and checks initial PPE compliance at entry gate.
              </p>
            </div>
            <div className="mt-2 text-[10px] text-blue-400 flex items-center gap-1 font-semibold">
              Logs active session to Firestore <ArrowRight className="w-3 h-3" />
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-[#141b24] border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded">
                  ZONE 2: PRODUCTION BAY
                </span>
                <span className="text-slate-500 text-[10px]">Elevated Cam (CAM_01)</span>
              </div>
              <p className="font-bold text-slate-200 mb-1">Continuous PPE & Worker Tracking</p>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Lightweight YOLOv8 tracking with ByteTrack. Biometric inference is skipped on normal frames to preserve CPU cycles.
              </p>
            </div>
            <div className="mt-2 text-[10px] text-amber-400 flex items-center gap-1 font-semibold">
              Debounces violations &gt;= 15 frames <ArrowRight className="w-3 h-3" />
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-[#141b24] border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-red-500/20 text-red-300 rounded">
                  IDENTITY RESOLUTION
                </span>
                <span className="text-slate-500 text-[10px]">Event-Driven Trigger</span>
              </div>
              <p className="font-bold text-slate-200 mb-1">Cross-Angle Identity Resolution</p>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                If face is turned away or visor-occluded, orchestrator correlates the entry timestamp to resolve the worker identity.
              </p>
            </div>
            <div className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
              Dispatches targeted alert with name <CheckCircle2 className="w-3 h-3" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Multi-Camera Views & Gate Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Video Feeds */}
        <div className="lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Video className="w-4 h-4 text-emerald-400" />
              Active Video Feeds ({cameras.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setModalCameraId(cameras.length >= 2 ? "CCTV_03" : "CCTV_02");
                  setIsConnectModalOpen(true);
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[11px] font-bold border border-blue-500/40 transition-colors"
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
                <span>Add / Connect Feed</span>
              </button>
              <span className="text-[11px] text-slate-400">
                Low-Latency MJPEG &amp; RTSP Ingestion
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cameras.map((camera, idx) => {
              const zone = zones.find((z) => z.zone_id === camera.zone_id);
              return (
                <CameraViewer
                  key={camera.camera_id ? `${camera.camera_id}-${idx}` : `cam-${idx}`}
                  camera={camera}
                  workers={workerTracks}
                  zoneName={zone?.name || camera.zone_id}
                  hasFireHazard={liveHazard?.fire || zone?.fire_detected}
                  hasSmokeHazard={liveHazard?.smoke || zone?.smoke_detected}
                  onConnectIp={(cam) => {
                    setModalCameraId(cam.camera_id);
                    setIsConnectModalOpen(true);
                  }}
                />
              );
            })}

            {/* Quick Connect Dashed Card for Additional Cameras */}
            {cameras.length < 4 && (
              <div
                onClick={() => {
                  const nextSlot = cameras.length === 2 ? "CCTV_03" : "CCTV_04";
                  setModalCameraId(nextSlot);
                  setIsConnectModalOpen(true);
                }}
                className="rounded-lg border-2 border-dashed border-slate-700/80 hover:border-blue-500/60 bg-[#0E131A]/60 hover:bg-blue-500/5 transition-all p-6 flex flex-col items-center justify-center text-center cursor-pointer min-h-[240px] group"
              >
                <div className="w-12 h-12 rounded-full bg-blue-500/10 group-hover:bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3 transition-colors">
                  <Plus className="w-6 h-6 stroke-[2.5]" />
                </div>
                <span className="text-xs font-bold text-slate-200 group-hover:text-blue-300 uppercase tracking-wide">
                  Connect Additional IP Camera
                </span>
                <p className="text-[11px] text-slate-400 max-w-[220px] mt-1">
                  Tap here to link phone IP Webcam (Side View Left / Right) via Wi-Fi network.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Column: Gate Check-in & Access Audit Register */}
        <div className="space-y-4">
          <div className="bg-[#121821] border border-[#26303C] rounded-xl p-4 shadow-xl flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-[#26303C] pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                  Gate Access Audit Log
                </h3>
              </div>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded font-bold">
                {gateLogs.length} Registered
              </span>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 mb-3 bg-[#0d1218] p-1 rounded border border-slate-800 text-[10px]">
              <button
                onClick={() => setFilterGatePpe("ALL")}
                className={`flex-1 py-1 rounded transition-colors ${
                  filterGatePpe === "ALL"
                    ? "bg-slate-700 text-white font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                ALL ({gateLogs.length})
              </button>
              <button
                onClick={() => setFilterGatePpe("COMPLIANT")}
                className={`flex-1 py-1 rounded transition-colors ${
                  filterGatePpe === "COMPLIANT"
                    ? "bg-emerald-600/60 text-emerald-200 font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                COMPLIANT
              </button>
              <button
                onClick={() => setFilterGatePpe("NON_COMPLIANT")}
                className={`flex-1 py-1 rounded transition-colors ${
                  filterGatePpe === "NON_COMPLIANT"
                    ? "bg-red-600/60 text-red-200 font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                NON-COMPLIANT
              </button>
            </div>

            {/* Scrollable list of entries */}
            <div className="space-y-2.5 overflow-y-auto max-h-[580px] pr-1 flex-1">
              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No gate entries match filter criteria.
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const isCompliant = log.ppe_status === "COMPLIANT";
                  return (
                    <div
                      key={log.log_id}
                      className="bg-[#161e29] border border-slate-800/80 hover:border-slate-700 rounded-lg p-3 transition-colors text-xs"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 font-bold flex items-center justify-center text-[10px]">
                            {log.worker_name.charAt(0)}
                          </div>
                          <span className="font-bold text-slate-100">{log.worker_name}</span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                            isCompliant
                              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                              : "bg-red-500/10 border border-red-500/30 text-red-400"
                          }`}
                        >
                          {isCompliant ? (
                            <>
                              <ShieldCheck className="w-3 h-3" /> COMPLIANT
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-3 h-3" /> VIOLATION
                            </>
                          )}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>
                            {log.timestamp_display ||
                              new Date(log.checkin_time).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-right justify-end">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{log.gate_id || "GATE_01"}</span>
                        </div>
                      </div>

                      {log.match_confidence !== undefined && (
                        <div className="mt-1.5 pt-1 border-t border-slate-800/40 text-[10px] text-slate-500 flex justify-between items-center">
                          <span>Biometric Confidence:</span>
                          <span className="text-cyan-400 font-bold">
                            {(log.match_confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Status Summary */}
            <div className="mt-3 pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Sync Mode: Cloud Firestore</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Listeners Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Connect IP Camera Modal */}
      <ConnectCameraModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        initialCameraId={modalCameraId}
      />
    </div>
  );
}
