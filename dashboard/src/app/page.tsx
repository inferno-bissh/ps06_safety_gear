"use client";

import React from "react";
import { useSafety } from "@/context/SafetyContext";
import { PriorityBadge } from "@/components/PriorityBadge";
import { CameraViewer } from "@/components/CameraViewer";
import { formatDateTime, cn } from "@/lib/utils";
import {
  Video,
  Boxes,
  AlertOctagon,
  Radio,
  ArrowRight,
  ShieldCheck,
  Plus,
  ExternalLink,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { ConnectCameraModal } from "@/components/ConnectCameraModal";
import { PhoneCameraSettings } from "@/components/PhoneCameraSettings";

export default function FacilityDashboardPage() {
  const {
    facility,
    zones,
    cameras,
    workerTracks,
    incidents,
    selectIncident,
    liveHazard,
    isVisionEngineOnline,
  } = useSafety();

  const [isConnectModalOpen, setIsConnectModalOpen] = React.useState(false);
  const [modalCameraId, setModalCameraId] = React.useState<string>("CCTV_02");
  const [showPhoneCamSettings, setShowPhoneCamSettings] = React.useState(false);

  const cctv1 = cameras.find((c) => c.camera_id === "CCTV_01") || cameras[0];
  const cctv2 = cameras.find((c) => c.camera_id === "CCTV_02") || cameras[1] || cameras[0];

  const openIncidents = incidents.filter((i) => i.status !== "RESOLVED");
  const p3Count = openIncidents.filter((i) => i.priority === "P3").length;
  const p2Count = openIncidents.filter((i) => i.priority === "P2").length;

  const onlineCamerasCount = cameras.filter((c) => c.status === "ONLINE").length;
  const activeViolationsCount = workerTracks.filter((w) =>
    Object.values(w.ppe).includes("FAIL")
  ).length;

  // Deduplicate zones
  const sortedZones = React.useMemo(() => {
    const uniqueMap = new Map<string, (typeof zones)[0]>();
    zones.forEach((zone, idx) => {
      const id = zone.zone_id || `zone-${idx}`;
      if (!uniqueMap.has(id)) {
        uniqueMap.set(id, { ...zone, zone_id: id });
      }
    });
    const order: Record<string, number> = { P3: 4, P2: 3, P1: 2, P0: 1 };
    return Array.from(uniqueMap.values()).sort(
      (a, b) => (order[b.current_priority] || 0) - (order[a.current_priority] || 0)
    );
  }, [zones]);

  return (
    <div className="space-y-5 pb-8 font-sans">
      {/* 1. Compact Overview Cards (4 Core Operational Metrics) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Active Incidents */}
        <div
          className={cn(
            "p-3.5 rounded-xl border bg-[#111722] flex flex-col justify-between transition-all",
            p3Count > 0
              ? "border-red-600/70 bg-red-950/20 ring-1 ring-red-500/40"
              : openIncidents.length > 0
              ? "border-amber-500/50 bg-amber-950/15"
              : "border-[#222C38] hover:border-slate-700"
          )}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
            <span>Active Incidents</span>
            <div
              className={cn(
                "p-1.5 rounded-lg",
                openIncidents.length > 0
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-emerald-500/10 text-emerald-400"
              )}
            >
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-100 flex items-center gap-2 font-mono">
            <span>{openIncidents.length}</span>
            {p3Count > 0 ? (
              <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded font-bold uppercase animate-pulse">
                {p3Count} Critical P3
              </span>
            ) : openIncidents.length > 0 ? (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-bold uppercase">
                Review Required
              </span>
            ) : (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-bold uppercase">
                All Clear
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5 truncate">
            {openIncidents.length === 0
              ? "Zero active safety violations"
              : `${openIncidents.length} safety alert${openIncidents.length > 1 ? "s" : ""} logged`}
          </div>
        </div>

        {/* Metric 2: Connected Cameras */}
        <div className="p-3.5 rounded-xl border border-[#222C38] bg-[#111722] hover:border-slate-700 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
            <span>Connected Cameras</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Video className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-100 flex items-center gap-2 font-mono">
            <span>
              {onlineCamerasCount} / {cameras.length}
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="text-[11px] text-emerald-400 mt-1.5 font-medium flex items-center gap-1.5 truncate">
            <span>Sub-50ms MJPEG AI Vision active</span>
          </div>
        </div>

        {/* Metric 3: PPE Compliance Status */}
        <div className="p-3.5 rounded-xl border border-[#222C38] bg-[#111722] hover:border-slate-700 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
            <span>PPE Safety Status</span>
            <div
              className={cn(
                "p-1.5 rounded-lg",
                activeViolationsCount > 0
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-emerald-500/10 text-emerald-400"
              )}
            >
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-100 flex items-center gap-2 font-mono">
            {workerTracks.length === 0 ? (
              <span className="text-emerald-400 text-lg sm:text-xl">Zero Violations</span>
            ) : activeViolationsCount > 0 ? (
              <span className="text-amber-400 text-lg sm:text-xl">
                {activeViolationsCount} Non-Compliant
              </span>
            ) : (
              <span className="text-emerald-400 text-lg sm:text-xl">100% Compliant</span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5 truncate">
            {workerTracks.length === 0
              ? "Area monitored • Ready for entry"
              : `${workerTracks.length} personnel tracked in zones`}
          </div>
        </div>

        {/* Metric 4: Sensor Connectivity (Real status - Awaiting Hardware) */}
        <div className="p-3.5 rounded-xl border border-[#222C38] bg-[#111722] hover:border-slate-700 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
            <span>Sensor Connectivity</span>
            <div className="p-1.5 rounded-lg bg-slate-800 text-slate-400">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-300 font-mono flex items-center gap-2">
            <span>Awaiting Hardware</span>
            <span className="w-2 h-2 rounded-full bg-amber-400/80" />
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 truncate">
            RS-485 Modbus node ready for link
          </div>
        </div>
      </div>

      {/* 2. Main Live-Monitoring Area (PRIMARY FOCUS - ABOVE THE FOLD) */}
      <section className="space-y-3">
        {/* Monitoring Area Header */}
        <div className="flex items-center justify-between flex-wrap gap-2.5 px-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm sm:text-base font-bold text-slate-100 uppercase tracking-wide">
              Live CCTV Operations Wall
            </h2>
            <span className="text-xs text-slate-400 hidden sm:inline">
              • Gate Choke-Point &amp; Production Bay Streams
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowPhoneCamSettings(!showPhoneCamSettings)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm border",
                showPhoneCamSettings
                  ? "bg-cyan-500/25 border-cyan-400 text-cyan-200"
                  : "bg-[#161F2B] hover:bg-slate-800 text-cyan-300 border-[#26303C]"
              )}
              title="Configure Phone Camera (CCTV 2) IP Address & Stream Settings"
            >
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span>Phone Camera Settings</span>
            </button>
            <button
              onClick={() => {
                setModalCameraId("CCTV_02");
                setIsConnectModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-600 active:scale-95 text-white text-xs font-bold transition-all shadow-sm"
              title="Connect Phone / IP Camera Stream (+)"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Connect IP Camera</span>
            </button>
            <Link
              href="/cameras"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161F2B] hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white text-xs font-bold border border-[#26303C] transition-all"
            >
              <span>Multi-Angle View</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
            </Link>
          </div>
        </div>

        {/* Collapsible Phone Camera Settings Section */}
        {showPhoneCamSettings && (
          <div className="animate-in fade-in duration-150">
            <PhoneCameraSettings />
          </div>
        )}

        {/* Responsive CCTV Camera Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cctv1 && (
            <CameraViewer
              camera={cctv1}
              workers={workerTracks}
              zoneName="Facility Gate Choke-Point"
              hasFireHazard={liveHazard?.cameras?.["CCTV_01"]?.fire || false}
              hasSmokeHazard={liveHazard?.cameras?.["CCTV_01"]?.smoke || false}
              onConnectIp={(cam) => {
                setModalCameraId(cam.camera_id);
                setIsConnectModalOpen(true);
              }}
            />
          )}
          {cctv2 && (
            <CameraViewer
              camera={cctv2}
              workers={workerTracks}
              zoneName="Production Bay (Front View)"
              hasFireHazard={liveHazard?.cameras?.["CCTV_02"] ? liveHazard.cameras["CCTV_02"].fire : (liveHazard?.fire || zones.find((z) => z.zone_id === cctv2.zone_id)?.fire_detected)}
              hasSmokeHazard={liveHazard?.cameras?.["CCTV_02"] ? liveHazard.cameras["CCTV_02"].smoke : (liveHazard?.smoke || zones.find((z) => z.zone_id === cctv2.zone_id)?.smoke_detected)}
              onConnectIp={(cam) => {
                setModalCameraId(cam.camera_id);
                setIsConnectModalOpen(true);
              }}
            />
          )}
        </div>
      </section>

      {/* 3. Secondary Section: Recent Incidents (Left) + Monitored Zones & Hardware (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-1">
        {/* Left Column (2 Cols wide on desktop): Recent Incident Action Feed */}
        <div className="lg:col-span-2 space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              <span>Recent Incident Feed ({openIncidents.length})</span>
            </h3>
            <Link
              href="/incidents"
              className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
            >
              <span>Alert Center</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="bg-[#111722] border border-[#222C38] rounded-xl p-3.5 space-y-2.5">
            {incidents.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <ShieldCheck className="w-9 h-9 text-emerald-500/70 mx-auto" />
                <div className="text-xs sm:text-sm font-bold text-slate-200">
                  NO ACTIVE SAFETY INCIDENTS
                </div>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Monitored sectors are operating within standard safety guidelines. Use the demo scenario bar to test edge hazard triggers.
                </p>
              </div>
            ) : (
              incidents.slice(0, 4).map((incident, idx) => (
                <div
                  key={incident.incident_id ? `${incident.incident_id}-${idx}` : `inc-${idx}`}
                  onClick={() => selectIncident(incident)}
                  className="bg-[#161F2B] border border-[#26303C] hover:border-blue-500/40 rounded-lg p-3 space-y-1.5 cursor-pointer transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <PriorityBadge priority={incident.priority} size="sm" />
                    <span className="text-[11px] text-slate-400 font-mono">
                      {formatDateTime(incident.timestamp)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs sm:text-sm text-slate-100 group-hover:text-blue-400 transition-colors">
                      {incident.source_event_type.replace("_", " ")}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                        incident.status === "OPEN"
                          ? "bg-amber-500/20 text-amber-300"
                          : incident.status === "ACKNOWLEDGED"
                          ? "bg-blue-500/20 text-blue-300"
                          : "bg-emerald-500/20 text-emerald-300"
                      )}
                    >
                      {incident.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-1">
                    {incident.zone_name} • {incident.decision_reason}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Hardware & Monitored Zones Readiness */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <h3 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-400" />
              <span>Monitored Facility Zones</span>
            </h3>
            <Link
              href="/zones"
              className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
            >
              <span>All Zones</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="bg-[#111722] border border-[#222C38] rounded-xl p-3 space-y-2">
            {sortedZones.map((zone, idx) => (
              <Link
                key={zone.zone_id ? `${zone.zone_id}-${idx}` : `zone-${idx}`}
                href={`/zones/${zone.zone_id}`}
                className="bg-[#161F2B] border border-[#26303C] hover:border-slate-700 p-2.5 rounded-lg flex items-center justify-between transition-colors block"
              >
                <div>
                  <div className="text-xs font-bold text-slate-200 truncate">{zone.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {zone.floor_area} • Cam: {zone.camera_id}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase",
                      zone.current_priority === "P3"
                        ? "bg-red-600 text-white animate-pulse"
                        : zone.current_priority === "P2"
                        ? "bg-orange-500 text-slate-950"
                        : zone.current_priority === "P1"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-slate-800 text-slate-300"
                    )}
                  >
                    {zone.current_priority}
                  </span>
                </div>
              </Link>
            ))}

            {/* Hardware Sensor Readiness Card (Secondary to camera monitoring) */}
            <div className="bg-[#131B26] border border-dashed border-[#2A3749] p-2.5 rounded-lg text-xs space-y-1 mt-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-slate-400" />
                  <span>Hardware Sensor Bus</span>
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                  RS-485 Modbus
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                Status: <span className="text-amber-400 font-semibold">Awaiting Physical Node</span>. Telemetry pipeline ready for ESP32 flame and gas telemetry ingestion.
              </p>
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
