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
} from "lucide-react";
import Link from "next/link";

export default function FacilityDashboardPage() {
  const { facility, zones, cameras, workerTracks, incidents, systemHealth, selectIncident, acknowledgeIncident } = useSafety();

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
    <div className="space-y-5 font-mono">
      {/* Page Title & Facility Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#26303C] pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase">
            Facility Safety Operations Console
          </h1>
          <p className="text-xs text-slate-400">
            Real-time multimodal monitoring • Edge Modbus telemetry & Cloud Vision inference
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Host Identifier:</span>
          <span className="bg-slate-800 border border-slate-700 text-blue-400 px-2 py-0.5 rounded font-bold">
            {facility.facility_id}
          </span>
        </div>
      </div>

      {/* Top Row: 5 KPI Status Cards (PRD Section 11 & UI/UX Section 6) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Total Cameras */}
        <div className="bg-[#121821] border border-[#26303C] p-3 rounded-lg shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>TOTAL CAMERAS</span>
            <Video className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{facility.total_cameras}</div>
          <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>2 Continuous Streams Pushing</span>
          </div>
        </div>

        {/* Active Monitored Zones */}
        <div className="bg-[#121821] border border-[#26303C] p-3 rounded-lg shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>ACTIVE ZONES</span>
            <Boxes className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{facility.active_zones}</div>
          <div className="text-[10px] text-slate-400 mt-1">Multi-zone policy active</div>
        </div>

        {/* Network Gateway Mode */}
        <div className="bg-[#121821] border border-[#26303C] p-3 rounded-lg shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>GATEWAY LINK</span>
            <Radio className="w-4 h-4 text-amber-400" />
          </div>
          <div className={cn("text-base font-bold truncate", netBadge.color.split(" ")[0])}>
            {netBadge.label}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {facility.emergency_response_available ? "Siren link available" : "No emergency fallback"}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-[#121821] border border-[#26303C] p-3 rounded-lg shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>SYSTEM HEALTH</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div
            className={cn(
              "text-base font-bold truncate",
              facility.emergency_response_available ? "text-emerald-400" : "text-red-400"
            )}
          >
            {facility.emergency_response_available ? "ALL NOMINAL" : "ATTN REQUIRED"}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">9 Subsystems Monitored</div>
        </div>

        {/* Active Incidents */}
        <div
          className={cn(
            "bg-[#121821] border p-3 rounded-lg shadow-sm transition-all",
            p3Count > 0
              ? "border-red-600 bg-red-950/20"
              : p2Count > 0
              ? "border-orange-500 bg-orange-950/15"
              : p1Count > 0
              ? "border-amber-500"
              : "border-[#26303C]"
          )}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>ACTIVE INCIDENTS</span>
            <AlertOctagon
              className={cn("w-4 h-4", openIncidents.length > 0 ? "text-amber-400" : "text-emerald-400")}
            />
          </div>
          <div className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <span>{openIncidents.length}</span>
            {p3Count > 0 && (
              <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded font-bold animate-pulse">
                {p3Count} P3
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {openIncidents.length === 0 ? "Zero safety violations" : `${openIncidents.length} require review`}
          </div>
        </div>
      </div>

      {/* Live CCTV Video Wall (CCTV 1 & CCTV 2) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <Video className="w-4 h-4 text-emerald-400" />
              <span>Live CCTV Operations Wall (Real-Time AI Streams · Port 5000)</span>
            </h2>
          </div>
          <Link
            href="/cameras"
            className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
          >
            <span>Full Multi-Angle View & Gate Audit Register</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cctv1 && (
            <CameraViewer
              camera={cctv1}
              workers={workerTracks}
              zoneName="Facility Gate Choke-Point"
            />
          )}
          {cctv2 && (
            <CameraViewer
              camera={cctv2}
              workers={workerTracks}
              zoneName="Production Bay (Front View)"
            />
          )}
        </div>
      </div>

      {/* Main Grid: Zones Status (Left) + Latest Incidents Feed (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column (2 Cols wide on desktop): Monitored Zone Cards */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-400" />
              <span>Monitored Facility Zones ({zones.length})</span>
            </h2>
            <Link
              href="/zones"
              className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
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
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              <span>Incident Action Log</span>
            </h2>
            <Link
              href="/incidents"
              className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
            >
              <span>Alert Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-[#121821] border border-[#26303C] rounded-lg p-3 space-y-2.5">
            {incidents.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <ShieldCheck className="w-10 h-10 text-emerald-500/60 mx-auto" />
                <div className="text-xs font-bold text-slate-300">NO ACTIVE SAFETY INCIDENTS</div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Facility operating within normal safety limits. Use the scenario bar above to simulate violations.
                </p>
              </div>
            ) : (
              incidents.slice(0, 5).map((incident, idx) => (
                <div
                  key={incident.incident_id ? `${incident.incident_id}-${idx}` : `inc-${idx}`}
                  onClick={() => selectIncident(incident)}
                  className="bg-[#1A222C] border border-[#26303C] hover:border-slate-600 rounded p-2.5 space-y-1.5 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <PriorityBadge priority={incident.priority} size="sm" />
                    <span className="text-[10px] text-slate-400 font-mono-tabular">
                      {formatDateTime(incident.timestamp)}
                    </span>
                  </div>

                  <div className="font-bold text-xs text-slate-100 group-hover:text-blue-400 transition-colors">
                    {incident.source_event_type.replace("_", " ")}
                  </div>

                  <p className="text-[11px] text-slate-400 line-clamp-1">
                    {incident.zone_name} • {incident.decision_reason}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                    <span
                      className={cn(
                        "font-bold uppercase",
                        incident.status === "OPEN"
                          ? "text-amber-400"
                          : incident.status === "ACKNOWLEDGED"
                          ? "text-blue-400"
                          : "text-emerald-400"
                      )}
                    >
                      Status: {incident.status}
                    </span>
                    <span className="text-blue-400 flex items-center gap-0.5 group-hover:underline">
                      Review <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom System Health Strip (UI/UX Section 6) */}
      <div className="bg-[#121821] border border-[#26303C] rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-[#26303C] pb-1.5">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>CRITICAL SUBSYSTEM STATUS STRIP</span>
          </div>
          <Link href="/system-health" className="text-blue-400 hover:underline text-[11px]">
            Inspect Diagnostics →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          {systemHealth.slice(0, 6).map((item, idx) => {
            const status = getStatusStyle(item.status);
            return (
              <div
                key={item.id ? `${item.id}-${idx}` : `health-${idx}`}
                className="bg-[#1A222C] p-2 rounded border border-slate-800/80 flex flex-col justify-between"
              >
                <span className="text-slate-400 text-[10px] truncate" title={item.name}>
                  {item.name}
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className={cn("text-[10px] font-bold", status.color)}>{status.label}</span>
                  <span className={cn("w-1.5 h-1.5 rounded-full", status.bg)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
