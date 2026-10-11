"use client";

import React from "react";
import { useSafety } from "@/context/SafetyContext";
import { ZoneCard } from "@/components/ZoneCard";
import { PriorityBadge } from "@/components/PriorityBadge";
import { CameraViewer } from "@/components/CameraViewer";
import { formatDateTime, getNetworkBadge, getStatusStyle, cn } from "@/lib/utils";
import {
  Video,
  Boxes,
  Activity,
  AlertOctagon,
  Radio,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  Eye,
  ExternalLink,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { ConnectCameraModal } from "@/components/ConnectCameraModal";

export default function FacilityDashboardPage() {
  const { facility, zones, cameras, workerTracks, incidents, systemHealth, selectIncident, acknowledgeIncident, liveHazard } = useSafety();
  const [isConnectModalOpen, setIsConnectModalOpen] = React.useState(false);
  const [modalCameraId, setModalCameraId] = React.useState<string>("CCTV_02");

  const cctv1 = cameras.find((c) => c.camera_id === "CCTV_01") || cameras[0];
  const cctv2 = cameras.find((c) => c.camera_id === "CCTV_02") || cameras[1] || cameras[0];

  const openIncidents = incidents.filter((i) => i.status !== "RESOLVED");
  const p3Count = openIncidents.filter((i) => i.priority === "P3").length;
  const p2Count = openIncidents.filter((i) => i.priority === "P2").length;
  const p1Count = openIncidents.filter((i) => i.priority === "P1").length;

  const netBadge = getNetworkBadge(facility.current_network_mode);

  // Deduplicate and sort zones so highest priority appears first
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
    <div className="space-y-6">
      {/* Page Title & Facility Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#26303C] pb-3.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-wider text-slate-100 uppercase">
            Facility Safety Operations Console
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Real-time multimodal monitoring • Edge Modbus telemetry &amp; Cloud Vision inference
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-semibold">Host Identifier:</span>
          <span className="bg-slate-800 border border-slate-700 text-blue-400 px-3 py-1 rounded-md font-mono font-bold text-xs shadow-sm">
            {facility.facility_id}
          </span>
        </div>
      </div>

      {/* Top Row: 5 KPI Status Cards (PRD Section 11 & UI/UX Section 6) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Cameras */}
        <div className="bg-[#121821]/90 backdrop-blur border border-[#26303C] p-4 rounded-xl shadow-md hover:border-slate-700 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>TOTAL CAMERAS</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Video className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100 font-mono-tabular">
            {facility.total_cameras}
          </div>
          <div className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1.5 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>2 Continuous Streams Pushing</span>
          </div>
        </div>

        {/* Active Monitored Zones */}
        <div className="bg-[#121821]/90 backdrop-blur border border-[#26303C] p-4 rounded-xl shadow-md hover:border-slate-700 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>ACTIVE ZONES</span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100 font-mono-tabular">
            {facility.active_zones}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">Multi-zone policy active</div>
        </div>

        {/* Network Gateway Mode */}
        <div className="bg-[#121821]/90 backdrop-blur border border-[#26303C] p-4 rounded-xl shadow-md hover:border-slate-700 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>GATEWAY LINK</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className={cn("text-lg sm:text-xl font-bold truncate", netBadge.color.split(" ")[0])}>
            {netBadge.label}
          </div>
          <div className="text-[11px] text-slate-400 mt-2 truncate">
            {facility.emergency_response_available ? "Siren link available" : "No emergency fallback"}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-[#121821]/90 backdrop-blur border border-[#26303C] p-4 rounded-xl shadow-md hover:border-slate-700 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>SYSTEM HEALTH</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div
            className={cn(
              "text-lg sm:text-xl font-bold truncate",
              facility.emergency_response_available ? "text-emerald-400" : "text-red-400"
            )}
          >
            {facility.emergency_response_available ? "ALL NOMINAL" : "ATTN REQUIRED"}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">9 Subsystems Monitored</div>
        </div>

        {/* Active Incidents */}
        <div
          className={cn(
            "border p-4 rounded-xl shadow-md transition-all flex flex-col justify-between",
            p3Count > 0
              ? "border-red-600 bg-red-950/25 ring-1 ring-red-500/50"
              : p2Count > 0
              ? "border-orange-500 bg-orange-950/20 ring-1 ring-orange-500/40"
              : p1Count > 0
              ? "border-amber-500 bg-amber-950/15"
              : "border-[#26303C] bg-[#121821]/90 hover:border-slate-700"
          )}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>ACTIVE INCIDENTS</span>
            <div
              className={cn(
                "p-1.5 rounded-lg",
                openIncidents.length > 0 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/10 text-emerald-400"
              )}
            >
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-100 flex items-center gap-2 font-mono-tabular">
            <span>{openIncidents.length}</span>
            {p3Count > 0 && (
              <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-md font-bold animate-pulse">
                {p3Count} P3
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            {openIncidents.length === 0 ? "Zero safety violations" : `${openIncidents.length} require review`}
          </div>
        </div>
      </div>

      {/* Live CCTV Video Wall (CCTV 1 & CCTV 2) */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
            <h2 className="text-sm sm:text-base font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <Video className="w-4 h-4 text-emerald-400" />
              <span>Live CCTV Operations Wall (Real-Time AI Streams · Port 5000)</span>
            </h2>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setModalCameraId("CCTV_02");
                setIsConnectModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition-all border border-blue-400/40 min-h-[38px]"
              title="Connect Phone / IP Camera Stream (+)"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Connect IP Camera</span>
            </button>
            <Link
              href="/cameras"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-blue-400 hover:text-blue-300 text-xs sm:text-sm font-bold border border-slate-700/80 transition-all min-h-[38px]"
            >
              <span>Full Multi-Angle View</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cctv1 && (
            <CameraViewer
              camera={cctv1}
              workers={workerTracks}
              zoneName="Facility Gate Choke-Point"
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
              hasFireHazard={liveHazard?.fire || zones.find((z) => z.zone_id === cctv2.zone_id)?.fire_detected}
              hasSmokeHazard={liveHazard?.smoke || zones.find((z) => z.zone_id === cctv2.zone_id)?.smoke_detected}
              onConnectIp={(cam) => {
                setModalCameraId(cam.camera_id);
                setIsConnectModalOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {/* Main Grid: Zones Status (Left) + Latest Incidents Feed (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols wide on desktop): Monitored Zone Cards */}
        <div className="lg:col-span-2 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-400" />
              <span>Monitored Facility Zones ({zones.length})</span>
            </h2>
            <Link
              href="/zones"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-blue-400 hover:text-blue-300 text-xs font-bold border border-slate-700/80 transition-all min-h-[34px]"
            >
              <span>View All Zones</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedZones.map((zone, idx) => (
              <ZoneCard key={zone.zone_id ? `${zone.zone_id}-${idx}` : `zone-${idx}`} zone={zone} />
            ))}
          </div>
        </div>

        {/* Right Column: Latest Incident Feed */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              <span>Incident Action Log</span>
            </h2>
            <Link
              href="/incidents"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-blue-400 hover:text-blue-300 text-xs font-bold border border-slate-700/80 transition-all min-h-[34px]"
            >
              <span>Alert Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-[#121821]/95 border border-[#26303C] rounded-xl p-3.5 space-y-3 shadow-md">
            {incidents.length === 0 ? (
              <div className="text-center py-12 space-y-2.5">
                <ShieldCheck className="w-12 h-12 text-emerald-500/60 mx-auto" />
                <div className="text-xs sm:text-sm font-bold text-slate-200">NO ACTIVE SAFETY INCIDENTS</div>
                <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Facility operating within normal safety limits. Use the scenario bar above to simulate violations.
                </p>
              </div>
            ) : (
              incidents.slice(0, 5).map((incident, idx) => (
                <div
                  key={incident.incident_id ? `${incident.incident_id}-${idx}` : `inc-${idx}`}
                  onClick={() => selectIncident(incident)}
                  className="bg-[#18212D] border border-[#26303C] hover:border-blue-500/40 rounded-xl p-3.5 space-y-2 cursor-pointer transition-all group shadow-xs hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <PriorityBadge priority={incident.priority} size="sm" />
                    <span className="text-[11px] text-slate-400 font-mono-tabular">
                      {formatDateTime(incident.timestamp)}
                    </span>
                  </div>

                  <div className="font-bold text-xs sm:text-sm text-slate-100 group-hover:text-blue-400 transition-colors">
                    {incident.source_event_type.replace("_", " ")}
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-1">
                    {incident.zone_name} • {incident.decision_reason}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <span
                      className={cn(
                        "font-bold uppercase text-[11px]",
                        incident.status === "OPEN"
                          ? "text-amber-400"
                          : incident.status === "ACKNOWLEDGED"
                          ? "text-blue-400"
                          : "text-emerald-400"
                      )}
                    >
                      Status: {incident.status}
                    </span>
                    <span className="px-2.5 py-1 rounded bg-blue-600/20 group-hover:bg-blue-600/30 text-blue-300 font-bold text-xs border border-blue-500/40 flex items-center gap-1 transition-colors">
                      Review <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom System Health Strip (UI/UX Section 6) */}
      <div className="bg-[#121821]/95 border border-[#26303C] rounded-xl p-4 space-y-3 shadow-md">
        <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-200 border-b border-[#26303C] pb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>CRITICAL SUBSYSTEM STATUS STRIP</span>
          </div>
          <Link
            href="/system-health"
            className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 text-xs font-bold border border-slate-700 transition-colors"
          >
            Inspect Diagnostics →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          {systemHealth.slice(0, 6).map((item, idx) => {
            const status = getStatusStyle(item.status);
            return (
              <div
                key={item.id ? `${item.id}-${idx}` : `health-${idx}`}
                className="bg-[#18212D] p-2.5 rounded-lg border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                <span className="text-slate-400 text-xs truncate" title={item.name}>
                  {item.name}
                </span>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={cn("text-xs font-bold", status.color)}>{status.label}</span>
                  <span className={cn("w-2 h-2 rounded-full", status.bg)} />
                </div>
              </div>
            );
          })}
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
