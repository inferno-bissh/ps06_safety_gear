"use client";

import React from "react";
import { Zone } from "@/types/safety";
import { PriorityBadge } from "./PriorityBadge";
import { getPriorityColor, cn } from "@/lib/utils";
import {
  MapPin,
  Users,
  Flame,
  Radio,
  HardHat,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

interface ZoneCardProps {
  zone: Zone;
}

export const ZoneCard: React.FC<ZoneCardProps> = ({ zone }) => {
  const priorityStyle = getPriorityColor(zone.current_priority);

  return (
    <div
      className={cn(
        "rounded-lg bg-[#121821] border p-4 font-mono transition-all flex flex-col justify-between shadow-md",
        priorityStyle.border,
        zone.current_priority === "P3" && "ring-2 ring-red-500/50 bg-red-950/20 animate-pulse",
        zone.current_priority === "P2" && "ring-1 ring-orange-500/30 bg-orange-950/10",
        zone.current_priority === "P1" && "border-l-4 border-l-amber-500"
      )}
    >
      <div>
        {/* Top Header */}
        <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-[#26303C]">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span>{zone.floor_area || zone.zone_id}</span>
            </div>
            <h3 className="font-bold text-sm text-slate-100 mt-0.5">{zone.name}</h3>
          </div>
          <PriorityBadge priority={zone.current_priority} size="sm" />
        </div>

        <p className="text-[11px] text-slate-400 mb-3 line-clamp-1">{zone.description}</p>

        {/* Status Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="bg-[#1A222C] p-2 rounded border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-blue-400" /> Workers:
            </span>
            <span className="font-bold text-slate-200">{zone.worker_count}</span>
          </div>

          <div className="bg-[#1A222C] p-2 rounded border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-orange-400" /> Modbus Node:
            </span>
            <span
              className={cn(
                "font-bold text-[11px]",
                zone.node_status === "ONLINE" ? "text-emerald-400" : "text-red-400"
              )}
            >
              {zone.node_status}
            </span>
          </div>

          <div className="bg-[#1A222C] p-2 rounded border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-red-400" /> Fire Sensor:
            </span>
            <span
              className={cn(
                "font-bold text-[11px]",
                zone.sensor_flame ? "text-red-400 animate-pulse" : "text-slate-300"
              )}
            >
              {zone.sensor_flame ? "TRIPPED (1)" : "Normal (0)"}
            </span>
          </div>

          <div className="bg-[#1A222C] p-2 rounded border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Smoke Index:
            </span>
            <span
              className={cn(
                "font-bold text-[11px] font-mono",
                (zone.sensor_smoke_raw ?? 0) > 400 ? "text-orange-400" : "text-slate-300"
              )}
            >
              {zone.sensor_smoke_raw ?? 0} ({(zone.sensor_smoke_index ?? 0).toFixed(2)})
            </span>
          </div>
        </div>

        {/* Required PPE items tags */}
        <div className="text-[10px] text-slate-400 mb-2">
          <span className="font-bold uppercase tracking-wider block mb-1">Zone PPE Mandate:</span>
          <div className="flex flex-wrap gap-1">
            {zone.ppe_policy?.helmet_required && (
              <span className="bg-slate-800 text-blue-300 border border-slate-700 px-1.5 py-0.2 rounded">
                Helmet
              </span>
            )}
            {zone.ppe_policy?.vest_required && (
              <span className="bg-slate-800 text-blue-300 border border-slate-700 px-1.5 py-0.2 rounded">
                Vest
              </span>
            )}
            {zone.ppe_policy?.gloves_required && (
              <span className="bg-slate-800 text-blue-300 border border-slate-700 px-1.5 py-0.2 rounded">
                Gloves
              </span>
            )}
            {zone.ppe_policy?.safety_shoes_required && (
              <span className="bg-slate-800 text-blue-300 border border-slate-700 px-1.5 py-0.2 rounded">
                Boots
              </span>
            )}
            {(!zone.ppe_policy ||
              (!zone.ppe_policy.helmet_required &&
                !zone.ppe_policy.vest_required &&
                !zone.ppe_policy.gloves_required &&
                !zone.ppe_policy.safety_shoes_required)) && (
              <span className="text-slate-500 italic">No PPE required in this zone</span>
            )}
          </div>
        </div>
      </div>

      {/* Drill-down action link */}
      <Link
        href={`/zones/${zone.zone_id}`}
        className="mt-2 pt-2 border-t border-[#26303C] flex items-center justify-between text-xs text-blue-400 hover:text-blue-300 font-bold transition-colors"
      >
        <span>Inspect Zone & Camera</span>
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
};
