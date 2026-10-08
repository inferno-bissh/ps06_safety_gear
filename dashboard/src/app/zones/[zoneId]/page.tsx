"use client";

import React, { use } from "react";
import { useSafety } from "@/context/SafetyContext";
import { CameraViewer } from "@/components/CameraViewer";
import { PriorityBadge } from "@/components/PriorityBadge";
import { PPEChip } from "@/components/PPEChip";
import { getPriorityColor, cn } from "@/lib/utils";
import {
  Boxes,
  MapPin,
  Flame,
  Radio,
  Sliders,
  AlertTriangle,
  ArrowLeft,
  Users,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default function ZoneDetailPage({ params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = use(params);
  const { zones, cameras, workerTracks, updatePPEPolicy } = useSafety();

  const zone = zones.find((z) => z.zone_id === zoneId);
  if (!zone) {
    notFound();
  }

  const camera = cameras.find((c) => c.zone_id === zone.zone_id);
  const zoneWorkers = workerTracks.filter((w) => w.zone_id === zone.zone_id);

  return (
    <div className="space-y-5 font-mono">
      {/* Back button & Zone Header */}
      <div>
        <Link
          href="/zones"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-2 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Zones Overview</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#26303C] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-wider text-slate-100 uppercase">
                {zone.name}
              </h1>
              <PriorityBadge priority={zone.current_priority} />
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-1">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span>{zone.floor_area || zone.zone_id}</span>
              <span>•</span>
              <span>{zone.description}</span>
            </p>
          </div>

          <Link
            href="/settings"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors self-start"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span>Edit Policy</span>
          </Link>
        </div>
      </div>

      {/* Main Content Layout: Camera Viewer (Left) + Physical Telemetry & PPE Policy (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Live Zone Camera */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
            <span>Primary Zone Video Stream ({camera?.camera_id || "CAM_01"})</span>
          </h2>

          {camera ? (
            <CameraViewer
              camera={camera}
              workers={workerTracks}
              zoneName={zone.name}
              hasFireHazard={zone.fire_detected}
              hasSmokeHazard={zone.smoke_detected}
            />
          ) : (
            <div className="bg-[#121821] border border-[#26303C] p-10 rounded-lg text-center text-slate-400 text-xs">
              No camera mapped to this zone.
            </div>
          )}
        </div>

        {/* Right Column: Physical RS-485 Sensors & Policy */}
        <div className="space-y-4">
          {/* Physical Modbus Telemetry Card */}
          <div className="bg-[#121821] border border-[#26303C] rounded-lg p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between border-b border-[#26303C] pb-2">
              <h3 className="text-xs font-bold text-slate-200 uppercase flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-orange-400" />
                <span>RS-485 Modbus Telemetry</span>
              </h3>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                SLAVE: {zone.zone_id === "WELDING_ZONE" ? "ADDR 0x01" : "ADDR 0x02"}
              </span>
            </div>

            {/* Registers 40001 - 40005 Table */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center p-2 rounded bg-[#1A222C] border border-slate-800">
                <span className="text-slate-400">Reg 40001 (Flame Status):</span>
                <span
                  className={cn(
                    "font-bold font-mono",
                    zone.sensor_flame ? "text-red-400 animate-pulse" : "text-emerald-400"
                  )}
                >
                  {zone.sensor_flame ? "1 (FLAME TRIPPED)" : "0 (NORMAL)"}
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded bg-[#1A222C] border border-slate-800">
                <span className="text-slate-400">Reg 40002 (Gas Raw ADC):</span>
                <span className="font-bold text-amber-400 font-mono">
                  {zone.sensor_smoke_raw} / 1023
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded bg-[#1A222C] border border-slate-800">
                <span className="text-slate-400">Reg 40003 (Smoke Index):</span>
                <span className="font-bold text-amber-400 font-mono">
                  {zone.sensor_smoke_index.toFixed(2)} (0.00-1.00)
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded bg-[#1A222C] border border-slate-800">
                <span className="text-slate-400">Reg 40004 (Sensor Health):</span>
                <span className="font-bold text-emerald-400 font-mono">
                  0 (ALL OK)
                </span>
              </div>

              <div className="flex justify-between items-center p-2 rounded bg-[#1A222C] border border-slate-800">
                <span className="text-slate-400">Reg 40005 (Heartbeat):</span>
                <span className="font-mono text-slate-300">
                  MONOTONIC ACTIVE
                </span>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 italic leading-tight pt-1">
              *MQ-2 output represented as raw index; not calibrated PPM per PRD §7 rule.
            </p>
          </div>

          {/* Zone PPE Policy Matrix Card */}
          <div className="bg-[#121821] border border-[#26303C] rounded-lg p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between border-b border-[#26303C] pb-2">
              <h3 className="text-xs font-bold text-slate-200 uppercase flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-purple-400" />
                <span>Zone PPE Compliance Policy</span>
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">v{zone.ppe_policy.policy_version}</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center p-2 rounded bg-[#1A222C] border border-slate-800">
                <span className="text-slate-300">Safety Helmet:</span>
                <button
                  onClick={() =>
                    updatePPEPolicy(zone.zone_id, {
                      helmet_required: !zone.ppe_policy.helmet_required,
                    })
                  }
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-bold border transition-colors",
                    zone.ppe_policy.helmet_required
                      ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                      : "bg-slate-800 text-slate-500 border-slate-700"
                  )}
                >
                  {zone.ppe_policy.helmet_required ? "REQUIRED" : "NOT REQUIRED"}
                </button>
              </div>

              <div className="flex justify-between items-center p-2 rounded bg-[#1A222C] border border-slate-800">
                <span className="text-slate-300">High-Vis Vest:</span>
                <button
                  onClick={() =>
                    updatePPEPolicy(zone.zone_id, {
                      vest_required: !zone.ppe_policy.vest_required,
                    })
                  }
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-bold border transition-colors",
                    zone.ppe_policy.vest_required
                      ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                      : "bg-slate-800 text-slate-500 border-slate-700"
                  )}
                >
                  {zone.ppe_policy.vest_required ? "REQUIRED" : "NOT REQUIRED"}
                </button>
              </div>

              <div className="flex justify-between items-center p-2 rounded bg-[#1A222C] border border-slate-800">
                <span className="text-slate-300">Protective Gloves:</span>
                <button
                  onClick={() =>
                    updatePPEPolicy(zone.zone_id, {
                      gloves_required: !zone.ppe_policy.gloves_required,
                    })
                  }
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-bold border transition-colors",
                    zone.ppe_policy.gloves_required
                      ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                      : "bg-slate-800 text-slate-500 border-slate-700"
                  )}
                >
                  {zone.ppe_policy.gloves_required ? "REQUIRED" : "NOT REQUIRED"}
                </button>
              </div>

              <div className="flex justify-between items-center p-2 rounded bg-[#1A222C] border border-slate-800">
                <span className="text-slate-300">Safety Footwear:</span>
                <button
                  onClick={() =>
                    updatePPEPolicy(zone.zone_id, {
                      safety_shoes_required: !zone.ppe_policy.safety_shoes_required,
                    })
                  }
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-bold border transition-colors",
                    zone.ppe_policy.safety_shoes_required
                      ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
                      : "bg-slate-800 text-slate-500 border-slate-700"
                  )}
                >
                  {zone.ppe_policy.safety_shoes_required ? "REQUIRED" : "NOT REQUIRED"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
